# FyMusic Phase 28 — 播放中切换音质偏好、搜索平台、Media Session 与页面生命周期组合验证

日期：2026-11-01（Asia/Singapore）

## 核心结论

第二十八阶段开发分支两套完整 CI 均为 `completed/success`。本阶段扩大第二十七阶段的真实用户点击检验到跨平台搜索切换与用户音质偏好更新，确认正在播放的 A 歌曲不会仅仅因为修改搜索平台、保存音质设置而被悄悄改名或换源。用户实际点击新的 B 搜索行后，浏览器再通过同一 HTMLAudioElement 真实加载另一种原创音频并继续播放。旧 A 元数据和重复迟到解析回调不会污染 B 的标题、来源、系统媒体信息或触发旧音频 HTTP 请求。

系统 Media Session 的 `pause` 与 `play` 操作通过在真实 Chromium 内拦截的受控系统 API 调用生产代码注册的处理函数，验证对实际媒体元素暂停/继续的效果。页面 `visibilitychange`、`pagehide`、`pageshow` 为**派发的事件通知**，不是真实设备后台/锁屏或浏览器冻结；只证明这些处理器在受控场景中不造成音频错源和不必要的二次 HTTP 请求。

## 开发与生产边界

- 仓库：`lxhlw/Only-testing-online-music`。
- 开发分支：`feature/fymusic-playback-verifier`。
- 完整双 CI 已验证的代码提交：`4cb04df7edfcd11eadee0bbb92f321adf84d3bde`。
- 生产 `main`：`c9a496ab580fb54775721b93a3944800bcaefc44`，本阶段从始至终未修改、未合并、未部署生产。
- 本阶段仅新增 `scripts/test-fymusic-phase28-quality-platform-os-browser.mjs` 并分别修改本地和 Edge 既有工作流。没有改动正式播放器、API 解析器、音质选项、Media Session 业务实现、用户界面或动画。
- 完整保留第一至二十七阶段的真实浏览器媒体、HTTP Range/206、弱网、MSE、封面、复杂音频和快速切歌回归。
- 使用已验证由 FFmpeg 生成的原创音频；没有访问野花或第三方商业歌曲。此前指定的孙燕姿《开始懂了》真实第三方音源本轮未验证，酷狗问题仍暂缓。

## 1. 技术实现

- 新测试在桌面尺寸的真实 Playwright Chromium 中打开 FyMusic 网站，使用现有的搜索平台标签、搜索框、搜索结果行等实际 DOM 控件。项目里的搜索和音源管理操作通过严格受控的 QA 目录和回调替代外部供应商，未伪造音频解码、播放器进度或 HTMLMediaElement 媒体事件。
- 用可测试的 `LXSourceManager.requestAction` 回调记录所选平台与请求质量，`LXMusicSearch.search` 仅返回指定的 WY 原创 A 与 KW 原创 B。`isPlayableUrlForSource` 仅接受隔离同域 `/api/fymusic-codec-selftest` 音频 API。
- **A** 由 WY 搜索行真正点击触发，用户固定请求 `flac24bit`，回调返回已通过上一阶段 FFprobe 验证的原创 FLAC 24-bit / 96kHz，浏览器真实原生 HTTP Range 206 播放。
- A 正在播放时，测试将 `LXPlaySettings` 更新为固定请求 `320k`、关闭自动降级，再点击 KW 搜索平台。此时浏览器**仍正在播放来源 WY 的 A**，平台标签只代表后续搜索目标，不应误将当前歌曲改成 KW 或直接更换音频。
- **B** 由 KW 搜索行真正点击触发，解析器只收到 `quality=320k`，并返回原创 `mp3-cover` MP3 文件。该文件是此前生成、带 ID3 内嵌封面的 192kbps QA 测试 MP3。**请求 320k 仅验证用户音质选择在解析器侧得到保留，不代表实际媒体已测得 320kbps**；测试明确记录了这种区别，不在正式播放器伪造媒体编码结果。
- 后续通过受控延迟响应返回 A 的伪造旧标题/歌手/专辑/平台/封面，且旧的解析回调再次给出合法的受控 M4A 地址。已真实播放的 B 不得变成旧的 WY 歌曲，音频请求也不得发向旧 M4A。
- 通过已安装的模拟 OS Media Session API，调用生产代码注册的 `pause` 和 `play`，检查 HTMLAudioElement 在暂停与重新播放后真实时间向前推进、源和界面身份保持 B。
- 派发 `visibilitychange`、`pagehide`、`pageshow` 后检查当前 B 仍是单音频源、时间继续推进，且 MP3 资源没有被重复拉取。
- 所有媒体 HTTP 请求走真正隔离 Cloudflare Pages/本地 Wrangler 流服务，不使用 `page.route(...fulfill)` 伪造音频响应，不使用 MSE，不增加第二播放器或生产轮询。

## 2. 双环境实际结果

| 证据 | 本地 Chromium | Cloudflare Edge |
|---|---|---|
| CI 最终状态 | completed/success | completed/success |
| 成功步骤 | 40 | 39 |
| 真实搜索行点击 | 2 | 2 |
| 首次音质请求 | flac24bit（WY） | flac24bit（WY） |
| 第二次音质请求 | 320k（KW） | 320k（KW） |
| 首次实际原创媒体文件 | FLAC 24-bit / 96kHz | FLAC 24-bit / 96kHz |
| 第二次实际原创媒体文件 | 带封面的 MP3 QA | 带封面的 MP3 QA |
| 两次实际媒体 HTTP 状态 | 206、206 | 206、206 |
| 改平台标签但不触发换源 | 是 | 是 |
| 旧 WY 元数据/解析回调被忽略 | 是 | 是 |
| 旧回调触发错误的 M4A 请求 | 0 | 0 |
| OS Media Session 暂停/继续实际音频 | 是 | 是 |
| 生命周期事件通知后继续播放 | 是 | 是 |
| 最终标题与 OS Media Session 一致 | Phase B MP3 | Phase B MP3 |
| 音频元素 | 唯一一个 | 唯一一个 |
| 完全没有第三方商业歌曲请求 | 是 | 是 |

输出标识：
- `FYMUSIC_PHASE28_QUALITY_PLATFORM_OS_MATRIX`
- `FYMUSIC_PHASE28_STATE_MATRIX_PASS`

CI：
- 本地完整测试 [GitHub Actions Run 41324623634](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41324623634)
- Cloudflare Edge 完整测试 [GitHub Actions Run 41324623472](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41324623472)
- 仅针对开发分支的隔离预览：**https://dd9c2e18.only-testing-online-music.pages.dev**
- 部署安全日志：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。

## 3. 界限与未完成部分

1. 这是基于受控歌曲目录和解析回调的**真实应用代码交互链**，而非真实第三方野花/酷狗歌曲链；外部音乐地址可用性依旧未知。
2. OS API 是测试时的 Media Session 模拟实现，已验证生产的操作处理器会调用现有真实媒体播放器；不代表真实 iOS / Android 系统后台、锁屏媒体控制或耳机按键已经验证。
3. 页面生命周期事件是通过浏览器页面派发，且未更改真实 `document.hidden` 状态；不能据此声称真正切换后台后 Chromium 页面被冻结或媒体继续保持。
4. 音质偏好更改是在第一首歌播放过程中保存，新偏好在用户点击第二首搜索结果后才使用；没有自行重启第一首或悄悄改变其当前编码。本轮只覆盖一种顺序和两个用户选曲场景。
5. `320k` 是传给受控解析器的请求质量，不是测试音频实际码率。用户依然可以选择高解析/无损，项目没有增加强制 128k 上限、未经授权跨平台回退或第二播放组件。
6. 未对 UI 加入不必要的高频轮询或功能性动画负担；并没有额外进行浏览器实际 FPS 的新统计，但原有性能回归全部仍通过。
7. 建议第二十九阶段：独立验证真实生命周期的后台冻结/恢复、复用状态与播放时间连续性；在受控音频下覆盖有中途加载的快速音质变更与用户按键操作。任何真实设备锁屏结果必须在真实设备执行后才能宣称成功。

本交接文档仅在双功能 CI 通过后创建，后续文档提交不修改功能代码，也没有将未执行的 docs-only SHA 误报为已通过双 CI。
