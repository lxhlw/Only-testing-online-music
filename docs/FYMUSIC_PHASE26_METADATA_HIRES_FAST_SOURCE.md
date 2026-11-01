# FyMusic 第二十六阶段 — 复杂元数据、24-bit FLAC 与原生音频快速换源

日期：2026-11-01（Asia/Singapore）

## 项目与边界

- 仓库：`lxhlw/Only-testing-online-music`
- 开发分支：`feature/fymusic-playback-verifier`
- **完整双 CI 通过的代码 HEAD：`f7a6466abbd494d7208c5e90856d1e11c37d3ca7`**
- 生产 `main` 仍为 `c9a496ab580fb54775721b93a3944800bcaefc44`，未修改、未合并、未部署正式版本。
- 本阶段只修改 QA 生成器、隔离模拟音频 HTTP 接口、测试脚本和两个 CI 工作流，正式播放器 UI、播放控制、解析器、选曲质量/跨平台规则都未改变。
- 继续维持用户硬性要求：现代 Web 高性能、流畅动画、单个真实 HTMLAudioElement、不适配 Android 4.4、不强制 128kbps、不静默进行跨平台音源替换；继续暂缓真实酷狗与野花故障调试。

## 1. 目标

在第二十五阶段通过的普通 MP3、AAC-LC（M4A）、FLAC 基线之上，使用**原创 12 秒音频**而不是商业音乐测试：

1. MP3 包含真正 ID3v2 元数据、独立原创内嵌 PNG 封面；
2. AAC-LC 使用 MP4/M4A 封装，`moov` 原子位于 `mdat` 之后（有别于 faststart）；
3. FLAC 为真正 24-bit / 96kHz，`ffprobe` 验证精度和采样率；
4. Chromium 通过真实 HTTP Range 206 请求解码各格式、识别持续时间并推进播放时间；
5. 在页面**现有唯一 `#audio`** 上短时间内依次替换 MP3 → AAC → FLAC，确认最终源为 FLAC，真实事件在最新音频加载后没有回到旧源；
6. 保留第一至二十五阶段已建立的媒体、UI、内存、弱网、MSE、Range、多轮对照和元数据竞态回归。

## 2. 新增或修改文件

1. `scripts/generate-fymusic-phase26-fixtures.mjs`：利用 FFmpeg 编码三段 440/660/880Hz 原创信号，并用 FFprobe、实际文件头、元数据及 SHA-256 验证。向仅在 CI 临时生成的 `qa-fixtures/phase26-manifest.json` 输出参数。无第三方版权素材。
2. `functions/api/fymusic-codec-selftest.js`：仅扩展 QA 白名单，允许 `format=mp3-cover`、`aac-tail`、`flac24` 获取原创生成文件；保留第二十五阶段已有 MP3/AAC/FLAC 行为。服务端支持 GET、HEAD、RFC 7233 206、不可满足范围 416、真实字节切片和隔离测试的网络暂停模式。不会被正式播放代码调用。
3. `scripts/test-fymusic-phase26-metadata-hires-browser.mjs`：验证三种格式的 HEAD、前缀范围、后缀范围、不可满足范围、媒体时长、真实播放事件及错误码，再执行单元素快速换源。
4. `.github/workflows/fymusic-playback-verifier.yml`：生成音频并在本地 Wrangler + Chromium 执行新回归。
5. `.github/workflows/fymusic-ui-preview.yml`：在确认 `production_branch=main` 的保护下，只向独立 Edge Preview 部署开发分支并执行同样回归。

本阶段没有增加正式用户媒体埋点、轮询、MSE 或第二播放器。

## 3. 原创音频生成参数

| 受控音频 | 大小 | 原创信号/编码 | 必须存在的文件结构 |
|---|---:|---|---|
| `mp3-cover` | 290,000 B | 440Hz、44.1kHz，MP3 192kbps QA 设置 | ID3v2 标题/歌手/专辑 + PNG `attached_pic` |
| `aac-tail` | 247,420 B | 660Hz、48kHz，AAC-LC 192kbps QA 设置 | M4A，`moov` 位于 `mdat` 后 |
| `flac24` | 1,015,564 B | 880Hz、96kHz，FLAC 24-bit | `fLaC` 头、`bits_per_raw_sample=24` |

三段音频的浏览器可读取时长均为约 12 秒。每种测试时采用的码率**不是正式播放器的最高音质、默认音质或上限**。FLAC 24-bit / 96kHz 为真正高解析无损编码。

本地与 Edge 所生成三种资产的 SHA-256 完全一致。生成脚本读取元数据标签并确认 MP3 的实际 `attached_pic` 标记，避免只依赖文件扩展名。

## 4. 双 CI 中原生解码证据

| 项目 | 本地 MP3+封面 | 本地 AAC 尾部 moov | 本地 FLAC 24-bit | Edge MP3+封面 | Edge AAC 尾部 moov | Edge FLAC 24-bit |
|---|---:|---:|---:|---:|---:|---:|
| canPlayType | probably | probably | probably | probably | probably | probably |
| 真正解码/播放时间推进 | 成功 | 成功 | 成功 | 成功 | 成功 | 成功 |
| 首次 playing | 38ms | 15ms | 24ms | 73ms | 51ms | 46ms |
| 浏览器媒体时长 | 12s | 12s | 12s | 12s | 12s | 12s |
| 真实 HTTP Range | 206 | 206 | 206 | 206 | 206 | 206 |
| MediaError | 0 | 0 | 0 | 0 | 0 | 0 |
| 有界采样器已解绑 | 是 | 是 | 是 | 是 | 是 | 是 |

真实 Range 响应示例：

- MP3 `bytes 0-289999/290000`
- AAC `bytes 0-247419/247420`
- FLAC `bytes 0-1015563/1015564`

特别观察：Edge AAC 在 `moov` 位于尾部时还实际发出了 `Range: bytes=229376-` 与 `Range: bytes=65536-`，对应的服务器返回均为 206。**这证明本次受控 M4A 样本的 Chromium 能通过额外范围请求读取媒体，不能概括为所有 AAC 或所有设备始终会采取相同顺序。**

本阶段只证明封面确实嵌入 MP3 文件、浏览器仍能解码；**没有测试或宣称 FyMusic 会自动从 ID3 提取该封面显示在页面上**。该能力需独立实现/验证。

## 5. 真实快速源替换

同一测试页面只使用 `document.querySelector('#audio')` 这一个媒体元素，先使用 `mp3-cover` 网络暂停模式，再以 170ms 左右的间隔更换为 `aac-tail`、最后 `flac24` 正常网络模式。没有创建 MSE、额外媒体元素或手工派发媒体事件。

本地和 Edge 均观察到：

- 真实旧媒体请求可能因换源被取消；`audio.play()` 旧请求允许符合浏览器行为的 `AbortError`。
- 最终元素 `currentSrc` 包含 `flac24`，真实请求响应 206，媒体时长约 12 秒，`paused=false`、`MediaError=0`。
- 最终 FLAC 真实播放时间推进至本地约 1.566 秒、Edge 约 1.554 秒。
- 最终 `flac24` 的 `loadedmetadata` 生效后，观察到 8 条播放/进度类事件，均属最后媒体源；**检测范围内无旧媒体覆盖**。
- 首次 CI 出现的失败是测试误将浏览器切换 `audio.src` 的清空/过渡阶段 `timeupdate` 认成旧音频恢复。修复为以最终媒体的 `loadedmetadata` 为界，继续严格检查后续播放、进度和最终媒体身份，而非忽略全部旧媒体事件。

注意：这是**原生媒体元素快速换源**验证；并非端到端歌单、真实搜索解析、歌手封面同步或第三方音源换曲测试。此前的 `test-fymusic-fast-track-metadata-browser.mjs` 仍单独检验应用层过期元数据响应不能覆盖当前歌曲。

## 6. CI 运行记录

### 首次提交与诊断

- 功能首版 `d6710288deb3ef2ca0fb092fae4f9225a798606b`
- 本地 [Run 41320856323](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41320856323)、Edge [Run 41320856297](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41320856297) 均因快速换源测试断言失败，其他格式解码/RFC Range 步骤已通过。**没有将首次运行描述为成功。**
- 修正提交 `f7a6466abbd494d7208c5e90856d1e11c37d3ca7`

### 最终通过

- 本地 Chromium [Run 41321620233](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41321620233)：`completed/success`，38 个成功步骤。
- Cloudflare Edge [Run 41321620106](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41321620106)：`completed/success`，37 个成功步骤。
- 通过安全检查 `FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`
- 独立 Edge Preview：**https://659d3784.only-testing-online-music.pages.dev**
- 关键日志标识：`FYMUSIC_PHASE26_ORIGINAL_METADATA_FIXTURES`、`FYMUSIC_PHASE26_NATIVE_METADATA_MATRIX`、`FYMUSIC_PHASE26_FAST_SOURCE_REPLACEMENT`、`FYMUSIC_PHASE26_METADATA_HIRES_PASS`。

交接文档在两条功能 CI 均成功后再提交，最后的 docs-only HEAD 不触发本阶段新的代码回归。

## 7. 限制和下一阶段

1. 本阶段从未验证孙燕姿《开始懂了》的真实线上解析与播放；野花/酷狗第三方接口先前已明确暂缓，不宣称已解决。
2. 只有原创单声道单频测试，不足以推断商业音乐各种不同封面、ID3 体积、FLAC 通道配置、网络质量、真实 Safari/iOS 或 Android 环境的广泛兼容性。
3. 浏览器可以解码带内嵌封面的 MP3 **不等于** FyMusic 已能够展示该封面；真正的 ID3 解析/专辑封面回退仍可另行实现，但不得阻塞播放或引入无界内存消耗。
4. 原生快速 `src` 切换与应用层歌单切歌需要分开判断；不能因此声称真实歌单 API、质量切换、Media Session 的所有组合已在同一专项覆盖。
5. 第二十七阶段推荐围绕正式播放器的选曲状态、音质标识和过期异步数据进一步做端到端状态一致性验收，仍以隔离授权测试数据进行真实浏览器验证。保持性能、单播放器、无自动跨平台回退、无 Android 4.4 兼容、无强制 128k 和正式 `main` 保护。
