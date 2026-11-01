# FyMusic 第 25 阶段 — 原创 MP3 / AAC-LC(M4A) / FLAC 真正浏览器解码与 RFC 7233

日期：2026-11-01（Asia/Singapore）

## 0. 仓库边界

- 仓库：`lxhlw/Only-testing-online-music`。
- 唯一开发分支：`feature/fymusic-playback-verifier`。
- 本阶段最后通过两套 CI 的代码 HEAD：`7432bf323f8583c35d8b2d3cce4c11e5aa8d05bd`。
- 生产 `main`：`c9a496ab580fb54775721b93a3944800bcaefc44`，**未修改、未合并，也未部署正式生产站**。
- 正式播放器代码、解析逻辑、歌单、质量选择、跨平台回退均没有修改。新增编码只用于隔离 QA，不意味着产品已经实现新音源解析或保证真实商用歌曲兼容。
- 原有第 1–24 阶段的所有浏览器、移动端、长时内存、UI、原生媒体、MSE、Range、HTTP 200/206 多轮回归均保留。

## 1. 目标

把前 24 阶段主要基于重复 MP3 校准帧的受控测试扩展为三种真正编码的独立原创音频。需要同时证明：

1. FFmpeg 真实生成合法音频文件，而不使用未经授权的第三方歌曲。
2. HTTP 响应与元数据、真实大小、Media Type 相符。
3. RFC 7233 的 GET/HEAD/206/416、开头范围与后缀范围有效。
4. 复用页面唯一 `#audio` 直接 `audio.src`，真正解码、推进播放时间、读取媒体时长。
5. 网络中断诱发的原生 `waiting` 如发生则必须自动恢复；FyMusic 自己显示缓冲 UI。不伪造事件、不手动调节时间、不添加 MSE、第二播放器或后台轮询。
6. 浏览器声明的 `canPlayType` 与实际解码结果分别记录，不能用前者冒充播放成功。

## 2. 实际改动

- `scripts/generate-fymusic-phase25-fixtures.mjs`：在 CI 隔离环境里利用 FFmpeg/FFprobe 从原创 440Hz 正弦信号，生成 30 秒、44.1kHz、单声道的 MP3、AAC-LC (M4A) 和 FLAC。带有 FyMusic QA 标题和艺术家元数据。输出验证时长、媒体头、大小、SHA-256 的 `qa-fixtures/phase25-manifest.json`。
- `functions/api/fymusic-codec-selftest.js`：仅对隔离 CI 生成的三种静态文件提供实际媒体数据；支持 GET、HEAD、规范单 Range 206、非法 416 和 10 秒的受控真实 HTTP 分块暂停；返回 `Cache-Control: no-store, no-transform`，不调用任何真实音源 API。
- `scripts/test-fymusic-phase25-codecs-browser.mjs`：本地、Edge 复用唯一 HTMLAudioElement，以实际 HTTP 媒体请求测试解码、Range、元数据和真实原生缓冲生命周期。事件来源于现有 Phase 22 有界诊断器，用后销毁监听器。
- 两条既有工作流：新增生成器/接口/浏览器测试的语法检查和路径过滤，显式安装 FFmpeg 后在**隔离**工作流生成原始素材。Cloudflare Pages 仅部署开发分支的独立 Preview，不向 `main` 推送任何生成文件。

首次代码提交 `57a3a3650bab4f08d6e4bd3c532d6b8dc10ba7d9` 的两条 CI 因 GitHub Runner 中找不到 `ffmpeg` 在生成阶段失败，**不是媒体解码失败**。第二次提交 `7432bf323f8583c35d8b2d3cce4c11e5aa8d05bd` 在两条工作流中显式 `apt-get install ffmpeg` 后，完整 CI 全部成功。

## 3. 原创生成素材（本地与 Edge SHA-256 一致）

| 格式 | 文件类型 | 文件大小 | 音频配置 |
|---|---|---:|---|
| MP3 | audio/mpeg, LAME 128k QA 码率 | 481,183 B | 30 s / 44.1kHz / 单声道 |
| AAC-LC | audio/mp4, MP4/M4A 96k QA 码率 | 366,772 B | 30 s / 44.1kHz / 单声道 |
| FLAC | audio/flac, 无损 | 1,178,650 B | 30 s / 44.1kHz / 单声道 |

以上码率仅是**本次原创测试资产的编码参数**，没有对真实产品质量选择添加 128k 限制。FLAC 是无损数据。

生成文件和 manifest 在 CI 运行时产生，不作为独立二进制源文件提交到代码分支。测试真实校验 MP3 ID3、M4A ftyp 和 FLAC fLaC 文件头；FFprobe 确认每种时长约 30s。生成的原始声音不是任何商业歌曲。

## 4. 浏览器真实播放结果

| 观测 | 本地 MP3 | 本地 AAC | 本地 FLAC | Edge MP3 | Edge AAC | Edge FLAC |
|---|---:|---:|---:|---:|---:|---:|
| canPlayType | probably | probably | probably | probably | probably | probably |
| 原生解码播放 | 是 | 是 | 是 | 是 | 是 | 是 |
| 首次 playing | 40ms | 15ms | 22ms | 49ms | 33ms | 36ms |
| 媒体时长 | 30s | 30s | 30s | 30s | 30s | 30s |
| 实际媒体 HTTP | 206 | 206 | 206 | 206 | 206 | 206 |
| 播放中途 waiting | 0 | 1 | 1 | 0 | 1 | 1 |
| 自然恢复 playing | 不适用 | 是 | 是 | 不适用 | 是 | 是 |
| 等待时缓冲提示 | 不适用 | 是 | 是 | 不适用 | 是 | 是 |
| 媒体错误码 | 0 | 0 | 0 | 0 | 0 | 0 |
| 诊断监听器解绑 | 是 | 是 | 是 | 是 | 是 | 是 |

重要：MP3 **没有观察到**播放中途 native waiting，所以没有宣称 MP3 在本次实验中证明了中途卡顿恢复；它证明了合法 MP3 文件实际播放、媒体时长读取、Range 支持及持续真实进度。AAC-LC 与 FLAC 都观察到了原生等待及恢复。

每种编码的 HTTP 测试还通过了 HEAD、首部 32 字节 206、后缀 16 字节 206、不可满足范围 416，且 Media Type 和 Content-Range 与实际文件大小一致。

## 5. 完整 CI、Edge 预览与安全保护

- 本地 Chromium [Run 41319321925](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41319321925)：`completed/success`，36 个成功步骤。
- Cloudflare Edge [Run 41319321920](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41319321920)：`completed/success`，35 个成功步骤。
- 独立预览 URL：**https://20b811d9.only-testing-online-music.pages.dev**
- 运行日志明确包含：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。
- 真实结果标识：`FYMUSIC_PHASE25_ORIGINAL_CODEC_FIXTURES`、`FYMUSIC_PHASE25_CODEC_MATRIX`、`FYMUSIC_PHASE25_ORIGINAL_MEDIA_PASS`。
- 两边生成文件大小和 SHA-256 一致；这只说明当前两条 FFmpeg CI 在此测试用例生成了一致的原创文件，并非所有外部编码器的通用确定性承诺。

## 6. 仍然存在的限制

- **用户指定的真实歌曲孙燕姿《开始懂了》未测试**。野花音源和酷狗真实解析仍按用户要求暂缓，没有证据表明第三方音乐源问题已修复。
- 只测三种编码的某一组受控参数；未证实 AAC ADTS、ALAC、其他 FLAC 位深、可变码率复杂音乐、含封面的极端 ID3/MP4 元数据或实际商用 CDN 的 Range 行为。
- Chromium Desktop CI 的通过不代表 Safari、iOS、安卓设备、后台锁屏或所有浏览器都能播放上述编码。
- 当前 10 秒 HTTP 中断仅诱发 AAC 和 FLAC 的真实等待；不同编码预缓冲策略各异，不能推广固定缓存阈值或修改产品默认播放器。
- 未增加任何生产播放代码、MSE、第二音频元素或长期资源占用；QA 文件只在隔离开发分支 Preview 被生成和部署。

## 7. 建议第二十六阶段

围绕真实文件的**复杂元数据和多质量格式**增加受控测试，例如 MP3 ID3v2 封面与变动标题、AAC 容器偏移、FLAC 24-bit / 96kHz 与大文件 Range。优先检查用户选曲快速切换时的原生媒体生命周期和音质显示是否真实一致，保持性能和优雅动画；不要重启已暂缓的第三方野花/酷狗上游故障排查，也不要对生产站部署作未授权操作。

本文件在两套功能 CI 全绿后提交，只含文档，不修改已验证的运行代码。
