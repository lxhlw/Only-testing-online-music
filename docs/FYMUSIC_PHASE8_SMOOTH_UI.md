# FyMusic Phase 8 — Smooth Web UI & isolated preview QA

日期：2026-11-01（Asia/Singapore）

## 本阶段范围

用户明确要求先不处理酷狗失败问题。因此这一阶段**没有修改** Flower 解析接口、KG/KW URL、野花原始脚本、音质策略或跨平台切换逻辑。重点是现代网页界面的状态同步、CPU/布局开销和测试自动化。不适配 Android 4.4。

所有修改仅在 `feature/fymusic-playback-verifier`；Cloudflare Pages 仅部署 Preview。生产 `main` 不合并、不部署。

## 修复 1 — 同帧 UI 更新不再丢失

文件：`src/modern-ui.js`；提交 `3fa088f5715e43b5ac09bab609e6ff912ea5acbe`。

旧代码仅存一个 `animationFrame` 标志：
- 第一个 MutationObserver / 音频事件调用 `schedule(work)` 安排 `requestAnimationFrame`；
- 下一帧前所有不同的 `schedule(otherWork)` 都因标志位存在而直接退出；
- 搜索状态、当前音源文本、歌词摘要、导航或新增列表动画存在一部分 DOM 未及时刷新甚至停留旧状态的风险。

新逻辑使用 `Set` 收集任务：同一函数的重复更新去重，不同的更新在同一绘制批次各执行一次。执行期间新入队任务交给下一帧，避免递归地更改 DOM。页面隐藏时保留最新待办任务，重新显示时补齐；不设置额外高频定时器。

对于带闭包的更新，把音源文本同步 `syncSource`、每个列表的 `updateListMotion` 固定为稳定函数引用，保证 Set 的去重有效。仍保留最大 12 项列表入场动画策略。

## 修复 2 — 关闭沉浸式播放器时跳过无意义 DOM 刷新

文件：`src/now-playing-experience.js`；提交 `10122f55093ef93598e05db4b5df242c69f8fd90`。

- `updateTransport()` 在弹层未打开时不做隐藏的时长、进度条、播放图标 DOM 重写。
- 逐字歌词事件仍由独立普通播放 UI 同步；隐藏沉浸式弹层时不必查询目标歌词行或计划布局滚动。
- 打开弹层时的 `openScreen()` 原本就同步调用 `updateTransport()` 并执行歌词定位，保证用户打开时看到最新播放状态。
- 保留媒体音频事件监听、求助于浏览器原生媒体播放，不创建第二个音频元素或轮询计时器。

## 自动化：同一帧多事件与弹层唤醒

文件：`scripts/test-fymusic-frame-coherence-browser.mjs`，提交 `13248085a937f7708199bf8b5629f3fd7fc74f82`。

Chromium 受控浏览器同时修改状态提示、音源标签、活动歌词行及搜索结果，随后验证：

- `statusSynced=true`
- `sourceSynced=true`
- `lyricSynced=true`
- `listMotionSynced=true`
- `footerSynced=true`
- `hiddenTransportIdle=true`
- `modalReopenCatchUp=true`

浏览器音频事件和文字是受控输入；此测试**不能**当作真实网络歌曲或音频编码验证。

## CI 与隔离 Cloudflare Preview

1. 扩展 `.github/workflows/fymusic-playback-verifier.yml`：新 UI JS 和浏览器脚本修改会触发本地 Pages/Chromium 回归。提交 `5d4951cb9521d97f927f0a1e92e50c718f24a455`。
2. [Phase 1 Run 41273146999](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41273146999)，`completed/success`，包含旧版搜索、人工备用、音质选择、请求头脱敏回归及新 `FYMUSIC_FRAME_COHERENCE_BROWSER_PASS`。
3. 新增 `.github/workflows/fymusic-ui-preview.yml`：Cloudflare API 首先验证 Pages 项目的生产分支为 `main`，强制使用非生产分支部署，校验 Preview 载入最新 `pendingUpdates=new Set()` 代码，再运行 **UI 专用 Chromium 测试**及启动 CPU Profile。不会运行酷狗/KW 网络解析的自动验收。提交 `ae63d1205000d4bf7bd1d3a23338eaf4cdfaf856`，后续仅改进工作流步骤名称避免误称为真实音乐播放测试。
4. [Phase 8 Preview Run 41273204767](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41273204767)，`completed/success`；以上七项 UI 检查在**真实 Cloudflare Preview** 再次全部通过。

成功的非生产 Preview：
https://793941e2.only-testing-online-music.pages.dev

本轮 Chromium Linux 首屏采样：DOMContentLoaded ~369ms、First Contentful Paint ~284ms、筛除浏览器 idle 后的本项目/ vendor 直接函数采样约 24ms。此数据是**单次 CI 环境测量**，不是 60 FPS、跨设备延迟或性能提升幅度的证明；没有与同设备同条件的修改前 A/B 对照，不能推断具体提升百分比。

## 明确未解决问题

- 本阶段按照用户要求未继续排查酷狗的网络失败；也没有对原本间歇性不可达的野花服务器做可靠性改动。
- 不宣称已经实现全设备恒定 60 FPS；实际用户设备仍需长列表滚动、弱网、低端 CPU 及动画压力测试。
- 仍需保持高品质播放与真实音频编码验证的边界：不强制所有音源 128k，也不声称请求参数即音频真实码率。
- **生产 main 未更新**。

## 建议下一步

保持 UX 优先级，下一阶段可测长列表追加/快速换歌、滚动与歌词同时出现的场景，包括键盘控制、弹层焦点还原及屏幕阅读器可访问性。要求测试输入与真实线上媒体证据严格分离。等用户主动恢复酷狗排障后，再继续原始 LX Desktop 与 Flower 404/403 差异分析。
