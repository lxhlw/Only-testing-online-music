# FyMusic Phase 14 — Fast Track Changes, Async Artwork Ownership & Bounded Metadata Caches

日期：2026-11-01（Asia/Singapore）

## 核心约束

- Web 产品名 FyMusic，不再使用 WhyMusic。
- 本阶段只优化快速切歌与媒体信息稳定性，不调查 KG/酷狗上游可播性、404/502。
- 保留用户控制的音质与原始解析/签名数据，不重新限制 128k；KG→KW 仍仅在明确选择并确认后才使用。
- 只在 `feature/fymusic-playback-verifier` 开发分支修改并部署非生产 Cloudflare Pages Preview。生产 `main` 未修改、未合并。
- 不兼容 Android 4.4.2；继续使用现代 Web 能力，无新增轮询和重型框架。

## 修复内容

文件 `src/now-playing-experience.js`，提交 `2107e7f562e7e9a77fda7833d039534c5365e1a1`。

### A. 异步元数据请求不可改变播放身份

发现：`applyMetadata(data)` 原来使用 `track={...track,...data}` 合并网络返回的所有字段。虽然部分异步调用已有 `sequence` 检查，但这一扩散会让上游 `source`、`id`、`name`、`sequence` 等非展示字段覆盖当前选择的歌曲身份，可能引发下一次切歌/加载逻辑的异常。

新实现：
- `applyMetadata(data, expectedSequence=sequence)` 先验证当前 `track.sequence`。
- 仅更新 `singer`、`albumName`、经过安全域名协议校验的 `image`；歌曲 `id`、`source`、`name`、`sequence` 由用户选中的曲目保持，不受元数据 API 覆盖。
- 请求成功后严格验证返回 ID 与当前被请求 ID 一致、封面 URL 经 `safeArt` 校验、未被新的播放序列取代，才将允许字段缓存并应用。
- 对于用户选择时就携带的封面地址也先通过 `safeArt(next.image,source)`。如果是无效 URL 则不展示，并仍允许通过合法网易云歌曲 ID 走正规元数据封面回退。
- 保留原有 AbortController 取消逻辑作为优化，但**不依赖浏览器或上游一定遵守取消信号**：即使旧请求晚到，也通过序列检查阻止更新。

### B. 长时间播放缓存边界

- `artCache` 最多保留 96 个曲目封面详情；`commentCache` 最多保留 48 页评论。
- 超额移除最早插入项，避免用户长期切歌/浏览大量评论后 metadata cache 不受限制增长。
- 仅缓存经校验的元数据字段，不缓存签名音频请求或媒体内容；不新增轮询。

## 新增受控 Chromium 竞态测试

文件 `scripts/test-fymusic-fast-track-metadata-browser.mjs`，提交 `45a8041adf601ea4726b9e901b9bb719f3dfe2cd`。

真实 Chromium 页面中，仅拦截 `/api/netease-song-meta` 并用本地的异步 Promise 人工控制返回顺序。故意不遵守 AbortSignal，验证比网络取消更加严格的请求序列守卫。图片响应为合成的 1×1 PNG，**没有真实第三方 API、图片服务、授权音乐或高码率播放验证**。

测试覆盖：
- A 111 和 B 222 快速相继选择，先返回 B、后返回 A；B 的歌名/歌手/专辑/封面和系统 MediaMetadata 保持不变。
- B 的服务端数据包含伪造的 `source=kg`、`sequence`、`name`，也不能改变用户选择的歌曲身份、平台或显示的歌曲名称。
- C 333 带不可信 `https://example.invalid` 封面地址：页面不会输出不可信封面或将其发布到系统媒体信息，但会继续向已验证的网易云元数据 API 请求封面。
- C 的白名单内封面成功后，迷你播放器和全屏播放器使用相同的真实 src 字符串、系统 MediaMetadata 拥有相同艺术家/专辑/封面。
- D 444 被用户先后选择两次（即歌曲 ID 相同、两次选择序列不同）。先返回新 D，再返回旧 D，旧响应不能覆盖新 D。
- 页面无 JS 异常；所有涉及标识符和歌曲名均为合成 QA 数据。

通过的 CI 日志：

`FYMUSIC_FAST_TRACK_METADATA_PASS {"rapidTrackChanges":5,"latePreviousTrackIgnored":true,"sameIdNewSequenceWins":true,"metadataIdentityLocked":true,"trustedFallbackCover":true,"oldOsArtworkNotRestored":true,"miniAndImmersiveArtworkAligned":true,"noExternalMedia":true}`

## CI 及开发站

- [本地 Chromium 完整测试 Run 41284534256](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41284534256)：completed/success。
- [Cloudflare Edge 隔离 Preview Run 41284530340](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41284530340)：completed/success。校验 `production_branch=main` 后生成非生产 preview，并运行同一快速切歌测试。
- 当前 Preview：https://bdc049a7.only-testing-online-music.pages.dev
- 该次 Cloudflare CI 单次采样：DOMContentLoaded 340ms、FCP 264ms、约 25ms CPU 样本。**不可推断 FPS 保证或性能提升百分比**。

## 下一阶段建议

下一阶段可进一步围绕真实视频/音频封面 DOM 请求导致的错误事件与快速切歌切换，或长歌单/后台 30 分钟以上实际设备播放性能作专门测试。不能将浏览器的合成元数据竞态测试说成网络音源的真实播放成功。保留所有历史回归和不更新生产 main 的工作纪律。
