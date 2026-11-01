# FyMusic Phase 20 — Throttled Audio, Native Buffer Starvation, Real MP3 Recovery

日期：2026-11-01（Asia/Singapore）

## 0. 项目边界

- 产品：FyMusic；仓库：`lxhlw/Only-testing-online-music`。
- 唯一开发分支：`feature/fymusic-playback-verifier`。
- 生产 `main` 当前核对值：`c9a496ab580fb54775721b93a3944800bcaefc44`，本阶段没有修改或合并 `main`。
- 只使用原创 440Hz WAV、项目授权校准 MP3 数据；未请求第三方音乐地址、野花或酷狗上游。
- 未修改 `src/app.js`、`src/player-controls.js` 或生产播放器架构，没有添加生产轮询、重试、第二播放器、自动跨平台回退或 128k 限制。
- 真实歌曲人工目标仍为孙燕姿《开始懂了》；本阶段没有验证其真实播放。

## 1. 起因和关键区别

第十九阶段已经证明 RFC 7233 Range、分块间隔和短读，但**没有证明播放中途原生等待**。它观察到 `nativeMidPlaybackWaitObserved=false`。

第二十阶段进行了两条明确区分的实验：

1. **普通 `audio.src` WAV 路径**：真实慢速 HTTP 数据流及 90 秒音频，验证请求层的限速，但由于 Chromium 可等待完整缓冲后开始播放，仍不能证明这条直连路径在播放中途发生缓冲耗尽。
2. **只在 QA 中使用的 MSE + MP3 路径**：仍复用页面现有的 `#audio` HTMLAudioElement，将实际 HTTP 分块交付的解码 MP3 数据依次 `SourceBuffer.appendBuffer`，诱导确实可观测的缓冲耗尽；不派发任何伪造媒体事件，不设置假的 `paused`/`readyState`/`currentTime`。此路径**不是生产播放器链路**。

两种路径不互相冒充证据。

## 2. 新增接口和脚本

- `functions/api/fymusic-throttle-selftest.js`：新增专用 90 秒、8000 Hz、16-bit 单声道、440Hz 原创 WAV，约 1,440,044 字节。支持 GET/HEAD、Range 206/416、no-store。初始交付约 6 秒 WAV 字节，然后以 1024 字节/500ms（约 2KB/s）供给 22 个小块，最后恢复正常流速。源文件不会用在用户选曲解析。
- `scripts/test-fymusic-throttled-buffering-browser.mjs`：直接字节流、真实 `audio.src` 播放、`buffered`/`readyState`/`currentTime` 和原生事件记录；要求真实分块耗时和真实播放，不假定网络延迟必然是播放中途卡顿。
- `scripts/test-fymusic-mse-starvation-browser.mjs`：用现有 `/api/fymusic-range-selftest?mode=gap&format=mp3` 和 `Range: bytes=0-85000`，网络真实传输前约 3.55 秒 MP3 数据、等待约 5.5 秒、再交付余量；通过单个原有 `#audio` 元素与 MSE 逐步交付，严格要求原生 `waiting` 在实际播放进度之后发生、之后自然恢复 `playing`、进度继续前进、FyMusic 自己显示缓冲 UI。
- `scripts/test-fymusic-modern-mobile-a11y.mjs`：异步音源列表替换 QA 按钮时，测试在有限次数内重插入仅 QA 的选项并**依旧执行 Playwright 真实 `tap()`**，消除原本不稳定的 DOM 脱离竞态。
- 两条现有 Actions workflow 同时纳入新增文件路径、语法检查和真实浏览器执行，旧回归未删除。

## 3. 普通直连 `audio.src` 的诚实观测（未触发播放中途等待）

| 指标 | 本地 Chromium | Cloudflare Edge |
|---|---:|---:|
| 慢速 HTTP 字节读取耗时 | 11,034ms | 11,048ms |
| 首字节时间 | 5ms | 36ms |
| MP3/WAV 实际播放进度 | 是 | 是 |
| 播放中途原生 waiting | **否** | **否** |
| 播放中途原生 stalled | 否 | 否 |
| 页面恢复自动重播 | 无 | 无 |
| 正常 WAV 显式恢复播放 | 成功 | 成功 |

两侧事件记录均显示在实际开始推进进度时已经缓冲完整约 90 秒 WAV，`readyState=4`。缓冲提示的出现仅发生在最初加载期间，不代表中途发生卡顿。**不能把普通直连流的这个实验宣传为已证明自然耗尽缓冲。**

## 4. MSE + 原生 HTMLAudioElement 的实际阳性证据

| 指标 | 本地 Chromium | Cloudflare Edge |
|---|---:|---:|
| 真实 MP3 网络接收字节 | 85,001 | 85,001 |
| 真实 HTTP Gap（最大分块间隔） | 5,501ms | 5,498ms |
| 原生 `waiting`（播放中途） | **是，约 3.5s** | **是，约 3.5s** |
| 等待时 `readyState` | 2 | 2 |
| FyMusic 缓冲提示 | **出现** | **出现** |
| 网络恢复后原生 `playing` | **是** | **是** |
| 后续播放进度继续增加 | **是** | **是** |
| 浏览器播放器元素数量 | 复用唯一 `#audio` | 复用唯一 `#audio` |
| 人工派发媒体事件 | 无 | 无 |
| 应用层自动重播 | 无 | 无 |

原生事件的核心时序（两侧一致）：

- 初始 `play@0` / `waiting@0`，这是正常加载，不能算中途等待；
- 收到 MP3 字节后 `loadedmetadata`、`canplay`、`playing`；
- 播放约 3.5 秒，`waiting@3.5s`，`readyState=2`，页面的缓冲提示实际显示；
- HTTP Gap 结束，追加剩余真实 MP3 字节；原生 `canplay`、`playing` 随之出现，时间从约 3.5s 继续向后推进。

该实验严格区分了 HTTP 数据传输、MSE 缓冲、HTMLAudioElement 原生事件和 UI 反应。音频没有由 JavaScript 手动跳时或伪造 waiting。

## 5. 最终本地与 Edge CI

- 本地全量 Chromium：[Run 41308678015](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41308678015) — `completed/success`。
- Cloudflare 独立 Edge Preview：[Run 41308678018](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41308678018) — `completed/success`。
- 隔离预览：**https://83407044.only-testing-online-music.pages.dev**。
- 已出现隔离保护标识：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。
- 成功测试标识：`FYMUSIC_THROTTLED_BUFFERING_PASS`、`FYMUSIC_MSE_BUFFER_STARVATION_PASS`、`FYMUSIC_MODERN_MOBILE_A11Y_PASS`，以及既有回归全部通过。
- 本阶段功能/回归提交：
  - `b4008dc0cbf6f86772d35f5e18b6d94cb5a4ddb0`：真实低带宽 WAV 接口与测试；
  - `1053a5dc172a5b397a3efb5712ae69766543369a`：MSE 阳性证据测试和移动 QA 触摸竞态修复。
- 本文档提交发生于上述两个 CI 全绿之后；文档提交不更改测试和运行代码。

## 6. 未解决的内容 / 建议下一阶段

1. **普通 `audio.src` 直连音频在播放中途因低带宽真实触发 `waiting` 尚未证明。** 本次 MSE 只是隔离测试，不能推导生产 `src` 直连也一定出现同样表现。
2. **真实第三方歌曲/野花/酷狗上游解析问题仍未解决**，继续按用户要求暂缓，不可声称孙燕姿《开始懂了》已经真实播放。
3. 没有用真实 Android 或 iOS 设备进行长时间播放/锁屏/弱网专项验证；没有证明所有设备长期 60FPS 或无内存问题。
4. 推荐第二十一阶段针对普通 `audio.src` 的早开播低带宽测试，研究为何 Chromium 在响应全部收到前不开始播放，以及对 MP3/其他媒体容器和合法 Range 请求的行为差异。严禁通过人为派发媒体事件或在生产播放器增加第二播放器掩饰问题。
5. 所有后续开发仍只在 `feature/fymusic-playback-verifier` 上进行；未经明确授权不合并 `main`、不部署正式域名、不强制质量降级或静默替换平台。
