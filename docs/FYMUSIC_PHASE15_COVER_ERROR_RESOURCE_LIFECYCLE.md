# FyMusic Phase 15 — Artwork Failure Isolation & Bounded Background Resources

日期：2026-11-01（Asia/Singapore）

## 目标及边界

持续开发现代、流畅的 FyMusic Web UI。本阶段重点针对快速切歌时过期图片加载错误，以及长列表大量 DOM 节点在后台挂起时被动画队列无上限引用的问题；同时清理已完成异步请求的控制器引用。

用户明确要求暂不排查酷狗上游问题，不适配 Android 4.4.2，音乐解析/签名/播放器实质路由不做改动；仍保留原先明确手动确认 KG→KW 备用切换、用户自选音质和仅非生产 Preview 部署规则。

开发分支：`feature/fymusic-playback-verifier`。生产 main 不改动。

## 发现与处理

### 1. 过期封面图片的失败事件可能清空新封面

文件 `src/now-playing-experience.js`，提交 `18dbca4d5200c489d98da85a110594521113872f`。

原有错误处理在图片的任意 `error` 事件中读取 `img.src` 并立即清除相同 src 的两处封面图，以及移除两处 `has-album-art` 状态。浏览器旧请求被新 src 取代后，部分图片错误事件可能迟到；如果新封面仍处于加载中，原写法会把新图片清空。

新行为：
- 用 `currentCoverUrl` 保存当前歌曲正在显示的受信任封面 URL。
- 错误事件仅在对应 `img.getAttribute('src')` 与当前 URL 一致、当前图片请求处于完成状态 `img.complete`、且图像没有成功解码 `naturalWidth===0` 时影响界面。正在加载和已经正确加载的新封面不受过期错误事件影响。
- 当前封面确实加载失败时，从两个固定 `img` 元素删除失败的 src、显示现有默认封面、使 Media Session 的 artwork 同步为空，但**保留当前歌曲名称、歌手、专辑和播放平台**。
- 清除失败封面对应的 metadata cache 条目，避免下一次选择该歌曲时继续认为此封面已验证可用。
- 不新增图片轮询、不额外创建图片元素或第二音频元素。

### 2. 请求控制器的生命周期收尾

文件同上：
- `resolveCover()` 的 `finally` 仅在仍持有同一 `AbortController` 的情况下把 `metaAbort` 置空。
- `loadComments()` 在 `finally` 采用相同方式清理 `commentAbort`。
- 旧请求在新请求之后完成不会清空新请求控制器；延续上一阶段的 sequence/token 校验。
- 继续使用原有受限元数据缓存 96 条和评论缓存 48 页。

### 3. 后台页面的大列表动画缓存无界引用

文件 `src/modern-ui.js`，提交 `f241c937c143a299017276c1a0170cfdd6dd7940`、`c5d0782ffd2d3779e5885486cd455e6d3ace98f6`。

原有 `animateAdded()` 每一帧最多动画 12 行，但 `newlyAdded` Set 会把一个 mutation 批次内全部新增 DOM 元素都添加进去。页面不可见时 `requestAnimationFrame` 不运行，因此持续新增/替换长列表可能令 Set 持有成千上万个 DOM 节点引用。

新行为：
- 在 MutationObserver 收集数据时就限制待处理列表动画节点 **最多 12 个**，包括单次 5,000/20,000 行 DocumentFragment 新增。
- 每次新 mutation 批次开始前移除已经不属于当前列表的旧 DOM 节点引用，避免后台替换列表后继续持有被移除的节点，并使前台恢复时动画针对最新列表。
- 只截断装饰动画队列，不截断实际歌单 DOM 行数，也不改变歌单搜索/选择/媒体数据。
- 继续复用一帧合并机制，不创建新定时器或持续动画循环。

## 新增 Chrome/Edge 受控回归

新测试 `scripts/test-fymusic-cover-error-resource-stress.mjs`，提交 `5b81966263aecef66432643704ef5ff45e113bce`，同时纳入本地与非生产 Edge CI：

- Chromium 中接管可信专辑图片 URL，为成功场景返回合成 1×1 PNG，为失败场景返回合成 HTTP 404，延迟中间歌曲的一组图片请求，**没有访问真实音乐 API 或获取真实图片**。
- A 已加载、B 正在加载时给图片派发旧 error；B 的两处封面及系统 artwork 不丢失。
- 当前 C 的图片真正 404：两个封面元素均取消失败地址、fallback 生效，系统 artwork 清理，但 C 的歌名/歌手仍正确。
- D 成功加载后人为触发延迟 error，不会清除已经加载成功的 D 图。
- 模拟文档隐藏状态：先装入 5,000 行，再替换为 4,000 行。插桩监听在 DOM 行元素上进行的 Set.add，验证待处理动画 Set 峰值不超过 12；前台恢复后实际动画的是当前列表前 12 行，而不是已被删除的节点。
- 连续 180 次模拟切歌后，最终显示最后一首歌曲，封面节点仍仅固定两个，未保留无效图片 src。
- 原有 Phase 14 快速切歌与 Phase 13 Media Session 回归保留；测试数据使用合成歌曲标识，未调用野花上游、未测试真实音频解码。

实际日志：
`FYMUSIC_COVER_ERROR_RESOURCE_STRESS_PASS {"pendingCoverSurvivesStaleError":true,"current404ClearsBothCoversAndOsArtwork":true,"laterValidCoverUnaffected":true,"maxQueuedAnimationElements":12,"backgroundReplaceReleasesStaleNodes":true,"foregroundNewRowsAnimated":12,"rapidTrackChanges":180,"fixedCoverDomNodes":2,"syntheticOnly":true}`

## 验收

- 本地 Cloudflare Pages Chromium：[Run 41295735636](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41295735636)，completed / success，含浏览器压力回归、签名日志隐私、上一阶段全部回归。
- Cloudflare Edge 非生产 Preview：[Run 41295730269](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41295730269)，completed / success，生产分支保护 `FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`，并在部署后的实际 Edge 页面再次通过相同的压力回归。
- 最新隔离预览：https://80969acc.only-testing-online-music.pages.dev
- Edge CI 单次采样：First Contentful Paint 272ms，DOMContentLoaded 326ms，约 26ms 采样脚本 CPU；**不能据此推断具体手机设备 60fps、运行 30 分钟的内存峰值或电池续航改善**。

## 下一阶段建议

后续阶段可以针对长时间使用的真实 Chromium Performance/Memory 指标，增加可重复的堆占用趋势采样和真正的触屏设备浏览器检查。浏览器 DOM 引用上界与合成切歌测试不能替代移动端系统内存压力、真实音频地址网络可靠性和息屏控制验证。

上线约束保持：直到用户明确授权，`main` 不得更改或部署。
