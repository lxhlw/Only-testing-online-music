# FyMusic Phase 27 — 真实 UI 选曲、解析状态、封面与音质一致性

日期：2026-11-01（Asia/Singapore）

## 最终结论

**本地 Chromium 和独立 Cloudflare Edge Preview 的完整 CI 均成功。** 本阶段在应用真正的搜索结果行、真实的 `startPlayback`、`requestQuality` 和 `useResolvedUrl` 业务代码路径上，验证三次快速选曲时旧回调无法取代最新歌曲。使用 QA 回调控制的“音源提供者”，而真正媒体内容来自上一阶段 FFmpeg 生成的原创 24-bit / 96kHz FLAC 文件，通过实际 HTTP 206 和页面现有唯一 `#audio` 解码播放。

此外，在禁用自动降级时，用户请求当前音源未声明支持的 `flac32bit` 会明确拒绝解析，不会降到 `128k` 或保留上一首媒体 URL。UI 音质声明仍明确标记为“音源能力声明，而非实际媒体码率或格式检测结果”。

## 代码与生产隔离

- 仓库：`lxhlw/Only-testing-online-music`
- 开发分支：`feature/fymusic-playback-verifier`
- 经过完整两套 CI 验证的代码 commit：`a2c6f79bcf5cbf0d3d94bece16482c292c0e98dd`
- 生产 `main` 保持 `c9a496ab580fb54775721b93a3944800bcaefc44`，无修改、无合并、无正式部署。
- 只新增 `scripts/test-fymusic-phase27-real-ui-state-browser.mjs` 并更新：
  - `.github/workflows/fymusic-playback-verifier.yml`
  - `.github/workflows/fymusic-ui-preview.yml`
- 正式播放器 `src/app.js`、`src/now-playing-experience.js`、`src/player-controls.js`、音乐源解析、OS 控制、音质设置、CSS 和动画均没有修改。
- 所有前 26 阶段回归，包括移动端、复杂封面、真实 Range、缓冲恢复、高解析度 FLAC、内存和交互测试均保留。

## 1. 真正 UI 交互，而非仅派发伪造 trackchange

测试通过真浏览器点击当前网易云平台标签、使用实际搜索输入框搜索，渲染后真实点击三条搜索结果行：

- 原创测试 A：id `101`
- 原创测试 B：id `202`
- 原创测试 C：id `303`

`LXSourceManager` 的活动源与异步 `requestAction` 回调使用受控测试桩，严格限制为当前所选 `wy` 平台；任何未经用户批准的跨平台解析视为错误。

三个源回调全部被暂存，然后**先兑现 C**，返回同域合法 `/api/fymusic-codec-selftest?format=flac24&mode=normal`。该接口返回真正 FFmpeg 原创的 24-bit/96kHz FLAC，浏览器实际发起 `Range: bytes=0-` 并收到 HTTP 206、解码、真实推进当前播放时间。并非 `route.fulfill` 提供伪造播放器的媒体响应，不通过 MSE，未手工推进进度或派发虚构原生媒体事件。

当 C 成功播放后，再逆序兑现 B、A 解析回调（旧回调返回的是可访问的其他受控 MP3/M4A URL，而非故意无效的字符串）。强断言：

- 最新 `currentSrc` 保持在 FLAC24。
- 没有因为旧解析结果而请求旧 MP3/M4A 媒体 URL。
- `fymusic:url-resolved` 仅有最新 C 的记录，质量请求始终为明确选择的 `flac24bit`，没有 `128k` 回退。
- 播放时间在旧回调返回后仍继续推进。
- 仅有页面已有的单一 `audio` 元素，未增加第二播放器或生产计时器。

## 2. 旧异步元数据与 Media Session 一致性

测试同时拦截 `/api/netease-song-meta` 请求，仅控制返回 JSON；刻意不尊重 AbortSignal，从而模拟已被取消但仍会迟到的真实网络响应。先返回最新 C 的元数据（歌手 `Confirmed C Singer`、专辑 `Confirmed C Album`、合法白名单封面地址），随后返回 A、B 的旧歌曲元数据，其中包含**伪造歌曲名、伪造渠道、旧歌手和旧封面**。

通过实际 DOM 与模拟 OS Media Session API 对照，确认：

- 歌词页标题与当前源仍是 C；
- 页面歌手、专辑没有被 B/A 覆盖；
- mini 封面与沉浸式封面一致；
- OS Media Session 的标题、歌手、专辑和 artwork 与最新 C 一致；
- 旧网络元数据不能偷换搜索平台或播放者身份；
- 当前质量摘要明确区分源的质量声明和真实媒体编码检测。

OS Media Session 的浏览器 API 使用受控 mock，用于验证生产页面的更新逻辑；这**不等于**已在真实操作系统锁屏或外部硬件上验证。

封面内容为受控的极小 PNG 图片，在浏览器中模拟许可的白名单域；不向第三方图片/音乐服务发起真实请求。

## 3. 不支持的高音质和无自动降级

第二个独立浏览器页面中设置：

- 固定用户请求质量 `flac32bit`
- `autoFallback=false`
- 当前源只声明 `flac24bit`、`320k`、`128k`

再次通过真实搜索行点击。最终：

- `requestAction` **调用零次**，不存在假冒 `flac32bit` 的低码率替代；
- 新歌曲身份在 UI 中更新，但当前 `audio.currentSrc` 留空，没有旧歌曲串台或错误继承；
- 明确显示不支持请求音质，且不自动降级；
- 质量摘要明确写明只代表音源能力声明，不代表已实测媒体比特率；
- 未发生用户未经确认的跨平台音乐源切换。

特别注意：测试媒体来自受控原始文件，用户选中的 `flac24bit` 质量确实在本次样本的 FFprobe 中对应 24-bit/96kHz FLAC；**不能因为这一例通过就断言所有花源的实际流都正确匹配其质量标签。**

## 4. 双 CI 原始实测

| 证据 | 本地 Chromium | Cloudflare Edge |
|---|---|---|
| 完整 CI | completed/success | completed/success |
| 成功步骤数 | 39 | 38 |
| 实际搜索行点击 | 3 | 3 |
| 返回真实当前 FLAC HTTP | 206 | 206 |
| 旧回调导致额外旧音频 HTTP | 0 | 0 |
| C 媒体时长 | 12 秒 | 12 秒 |
| 最终真实进度（日志采样） | 0.969 秒 | 0.930 秒 |
| C 歌手/专辑/UI/OS 信息一致 | 是 | 是 |
| 可信封面三个位置一致 | 是 | 是 |
| 单一 HTMLAudioElement | 是 | 是 |
| 未支持 flac32bit、禁用降级时解析器调用 | 0 | 0 |
| 未经授权改成 128k | 否 | 否 |

CI 链接：
- [本地 Chromium 完整运行 41323290221](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41323290221)
- [Cloudflare Edge 完整运行 41323290177](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41323290177)
- Edge 独立预览：**https://f4b3d39f.only-testing-online-music.pages.dev**
- 生产分支保护日志：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`
- 验收标识：
  - `FYMUSIC_PHASE27_REAL_UI_STATE_CHAIN`
  - `FYMUSIC_PHASE27_STATE_CONSISTENCY_PASS`

本阶段在上述两条代码 CI 成功后再提交此文档，文档提交本身不会改动可执行代码，也不会被错误地称为已经跑过这两套代码 CI。

## 5. 边界、未解决事项和后续

1. 最新 C 是原创受控 24-bit/96kHz FLAC，不是第三方商业音乐。提供者回调与搜索目录是严格 QA 测试数据，**没有验证野花/酷狗/真实孙燕姿《开始懂了》音源可用性**；仍按用户要求暂缓酷狗问题。
2. 真正 OS 锁屏、耳机按钮以及其他设备上的 Media Session 行为，本次并未测试。
3. 本次只证明三次快速点击和一次倒序异步响应的特定强制竞态；不等于全排列、任意数量切歌或不同音质动态设置的所有竞态均已覆盖。
4. 本次没有增添第三方音源自动切换，没有强制最高码率为 128kbps，不对 Android 4.4.2 添加兼容，不改变生产播放器/页面动画。
5. **第二十八阶段建议**在不增加生产复杂度前提下，扩展受控 UI 端到端矩阵至播放期间更换质量、切换搜索平台、Media Session 按钮与页面可见性竞态，同时保持严格身份一致性和原生媒体播放证据。每组试验记录当前真实请求及发生变动的触发条件，不从单条样本泛化到所有设备。
