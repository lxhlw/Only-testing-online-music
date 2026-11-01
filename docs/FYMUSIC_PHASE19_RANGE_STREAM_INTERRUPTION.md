# FyMusic Phase 19 — RFC 7233 Ranged Audio Streaming, Real Gaps and Truncated HTTP Transport

日期：2026-11-01（Asia/Singapore）

## 项目与本阶段边界

- 产品名 FyMusic。GitHub 仓库 `lxhlw/Only-testing-online-music`；部署项目 `only-testing-online-music`。
- 开发分支固定为 `feature/fymusic-playback-verifier`。**禁止修改生产 `main` 或通过这项开发阶段把代码部署到正式站。**
- 用户先前明确暂不继续排查酷狗/野花上游音乐 URL 失败，要求现代 Web 性能，不适配 Android 4.4.2、不强制音质 128k、不自动切换歌曲平台。
- 如果后续用户要求人工真实歌曲测试，目标为孙燕姿《开始懂了》，不是《成都》或《郭源潮》。本阶段没有接触该歌曲、任何野花接口、版权音源或音乐签名 URL。
- **本阶段只添加测试限定的媒体端点和浏览器回归；没有修改 FyMusic 正常播放路线、解析重试、用户音质偏好、Media Session 或播放器 UI。**

## 原因：Phase 18 的受控 WAV 一次性提供音频，无法证明网络中途供给不足

此前 Phase 18 使用 Chromium 实际加载解码 8 秒 WAV，并测试起始响应延迟、原生事件、暂停/恢复/seek/错误等。Phase 19 的目标是覆盖真实 HTTP 部分响应、可逐步读取的音频流及连接中断，而非仅通过 `page.route(...).fulfill({body: ...})` 一次性给出全部音频数据。

## 实施 1：开发分支专用的可流式响应端点

新增 `functions/api/fymusic-range-selftest.js`，首先提交 `36436650c53bf97b7573e93110ea51fc85a46fcb`，随后支持双媒体格式 `0a461cc0805033209ab6ab098e5bc4fdb2be56da`。

- 路径 `/api/fymusic-range-selftest`，仅是开发分支上的合成音乐测试接口，不参与真实播放器解析。
- 自行生成 14 秒、8kHz、16 位、单声道的原创 440Hz PCM WAV（224,044 字节），并可以基于仓库既有授权校准音频帧重复生成约 41.8 秒的 CBR MP3 测试数据。
- 正确响应 `HEAD`、`GET`、`Range: bytes=0-63`、`Range: bytes=-16`，包含 `Accept-Ranges: bytes`、`Content-Range`、`Content-Length`、`Content-Type` 和 `Cache-Control: no-store`。
- 非法超出文件边界的 Range 返回 HTTP 416，并返回 `Content-Range: bytes */<总字节数>`。
- `mode=normal`：正常逐块返回合成音频。
- `mode=gap&format=mp3`：流式发送约 3.55 秒的 MP3 帧，随后在服务端暂停 5,500ms，再继续发送剩余音频字节。
- `mode=cut&format=mp3`：在发送约 3.55 秒、28,424 字节合成 MP3 帧后，从服务端中断剩余数据传输，实际不返回声明的完整内容。
- 所有测试内容为原创/校准数据，不包含任何第三方音乐或签名信息。接口没有设置自动轮询、长期会话或业务功能开关。

## 实施 2：真实 Chromium 分两层验证

新增 `scripts/test-fymusic-range-stream-recovery-browser.mjs`，初始提交 `00900233678b4773fb6a5b55878231aeef344f70`，最终加强版测试提交 `b30d388c27383d0f7590f4ef93a5a91bd8d7bcfb`。

### A. HTTP Range / Byte Stream 证据

直接通过 Chromium `fetch`、`ReadableStream.getReader()` 读取同源测试接口：
- HTTP 206 仅返回请求的 WAV 字节区间，首四字节校验为 `RIFF`；负数后缀 Range 返回 16 字节；越界 416。
- 真正的 Gap 网络流在首批字节到达后，等待约 5.5 秒才继续接收字节。这是**网络实际逐步交付**，而不是 Playwright 向浏览器伪造 `waiting` 事件。
- Cut 流返回 HTTP 206，但客户端仅收到 28,424 字节，没有收到它声明的完整 85,001 字节部分内容。
- 不将这种 HTTP 层提前结束等同于 `HTMLAudioElement` 一定会立刻触发 `MediaError`。实际 Chromium 对不完整数据可采用预缓冲和不同的错误处理时序。

### B. 真实 Chromium 解码/前后台状态

用原页面现有的单个 `#audio` 元素播放流式 MP3 与正常 WAV。没有替换或伪造 `paused`、`currentTime`、`readyState` 或手动发出 `waiting` 等音频事件。

- MP3 真实解码和正常播放已成功。
- 页面 `pagehide/pageshow`、`online` 后，通过录制 `audio.play/load/pause` 调用次数证明没有未经用户动作的自动媒体操作。
- 截断流后仍记录真实媒体事件。当前测试中 Chromium 有真实播放进度，但**未观察到中途 `waiting` 或 `MediaError`**，不能宣称浏览器发生了播放中途卡顿；这项否定证据已被记录为明确字段。
- 随后测试显式选择 `mode=normal` 的 14 秒 WAV，在 Chromium 中真实解码播放，证明显式恢复路径仍可用；没有自动更换歌曲平台或音质。

### 为什么修改了最初过度严格的测试？

早期尝试直接强制要求 `audio` 在 MP3/WAV 分块延迟后、播放进度大于 1.25 秒时必然发出 `waiting`。但从调试日志看到 Chromium 先完成完整媒体缓冲，随后 `readyState=4`、连续播放，导致该预期不成立。不能将这个结果简单理解为产品“断网恢复失败”，也不能靠手动派发假事件让测试通过。

最终版**把字节流到达/中断证据与媒体自然事件分开**。真实网络延迟和短读必须验证，而中途媒体等待/错误是否出现如实作为观察值，避免虚假“原生断流”成功报告。

## 最终 CI 验收

- 本地完整 Chromium：[GitHub Actions Run 41303936669](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41303936669)：`completed/success`。
- Cloudflare Pages Edge 隔离预览：[GitHub Actions Run 41303958737](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41303958737)：`completed/success`。
- 隔离 Preview：https://cbc8df8d.only-testing-online-music.pages.dev
- Edge 生产保护日志：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。
- 两个 CI 工作流均包含该测试的代码语法检查、新文件路径以及测试实际运行，同时保留全部早先移动端/UI、真实 WAV 解码、内存、后台恢复、Media Session 等回归。

本地关键样本：
- Gap 网络响应总耗时 5,508 ms，首字节 9 ms 后到达；
- Cut HTTP 206，短读 28,424 字节；
- 真实 MP3 解码通过；
- `nativeMidPlaybackWaitObserved=false`、`nativeCutMediaErrorObserved=false`、`nativeCutWaitingAfterProgress=false`；
- `foregroundNoAutoReplay=true`、`explicitNormalWavRecovered=true`。

Edge 关键样本：
- Gap 网络响应总耗时 5,520 ms，首字节 19 ms 后到达；
- Cut HTTP 206，短读 28,424 字节；
- 真实 MP3 解码通过；
- `nativeMidPlaybackWaitObserved=false`、`nativeCutMediaErrorObserved=false`、`nativeCutWaitingAfterProgress=false`；
- `foregroundNoAutoReplay=true`、`explicitNormalWavRecovered=true`。
- 单次启动参考：FCP 204ms、DOMContentLoaded 255ms、约 19ms 的 first-party CPU 抽样。这不构成实际手机 60FPS/续航、长期加载性能或生产改善的统计保证。

## 仍需注意与下一阶段建议

1. 虽然流式延迟与 HTTP 206 短读均由真实服务端/浏览器字节响应证明，但在本轮浏览器中**没有证明音频播放至中途时遇到 waiting/error**；播放器的原生媒体内部缓冲策略可使这些事件不可观测。
2. 下一阶段若确实需要强制音频已经播放后耗尽缓冲，可以设计更接近用户网络条件的持久响应（大尺寸、长时间、有限带宽）或 Chromium 专门的真实服务端条件注入，不能为了通过测试伪造媒体事件。
3. 当前音源无法播放的真实问题未被解决或复测；仍按用户要求暂不处理酷狗野花上游接口。
4. 不要将开发分支的 QA 端点以生产功能对外宣传；只有用户明确授权才讨论生产部署/合并 `main`。
