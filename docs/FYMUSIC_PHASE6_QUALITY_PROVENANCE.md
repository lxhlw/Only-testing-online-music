# FyMusic Phase 6 — Source Quality Provenance & Real Media Verification

日期：2026-11-01（Asia/Singapore）。

## 限定条件与已修改内容

- 所有代码仅在开发分支 `feature/fymusic-playback-verifier`；不合并、不发布生产 `main`。
- 真实网络歌曲只使用孙燕姿《开始懂了》，原始野花脚本继续使用未修改的 `pdone/lx-music-source/main/flower/latest.js`。
- 不强制所有音质为 128k，不假设音源支持没有声明的 FLAC/320k，也不把解析请求的品质误称为媒体实际编码。
- 不保留或输出完整媒体 URL、签名、Hash、歌曲 ID、Cookie、Token、响应正文、CDP 原始 player IDs 或未经过白名单的媒体属性。
- KG → KW 仍要求用户手动查找、严格元数据候选核对和二次确认；KW 失败后仍只有用户点击才能重试。

### 改进 1 — 面向用户的质量透明显示

`src/app.js`，Commit `93130b4a399274cd44af261558a47d2965e6f23b`。

对于当前渠道已初始化但未列出音质的情况，界面明确报告“音源未声明可用音质”；与“音源准备中”分开。当前源只声明一个音质时会标示其唯一声明。固定选择 FLAC24 等高品质、但当前渠道未声明支持时：

- 禁用自动降级：显示“音源未声明支持 · 不自动降级”。
- 用户明确开启允许降级：显示原请求档位以及“已允许降级至 128k”等实际选择。
- `quality-summary.title` 明确区分音源声明与实际媒体码率/格式，禁止通过请求参数暗示文件编码。

`scripts/test-fymusic-cross-platform-browser.mjs`，Commit `b8eb8006a6e46baa6a3b3a2f1d52937046c6a2bc`，验证三种界面状态、保留已声明 FLAC24 的固定品质、无自动跨平台切换和人工再次确认。

[Phase 1 回归 CI 41271343781](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41271343781)：**completed / success**，真实浏览器回归日志 `sourceQualityProvenanceVisible=true`、`unsupportedQualityProtected=true`、`explicitKwRetryPreserved=true`。

### 改进 2 — 真实脚本声明与实际请求一致性

`scripts/diagnostics/fymusic-real-flower-kw.mjs`，Commit `1dcbda4fc3bbe1875d1ff288e23b0a765231d21d`。

记录下列互相独立的证据：

1. 真正装载的野花脚本每个平台允许列出的音质 `sourceDeclaredQualities`。
2. 用户设置为“最高音质优先”时：该源声明的最高 MP3 档位 `expectedHighestDeclaredMp3`。
3. 实际请求参数 `qualityRequests`。
4. 若声明列表非空，断言 KW 请求质量确实在列表之内，且等于最高已声明 MP3 档位；否则测试失败。
5. Chromium Media Domain 中若实际提供解码属性，**仅**采集白名单编解码器、音频码率、采样率、声道数；否则明确记为 null，并将 `mediaMetadataAvailable=false`。不为了填补空白而多下载媒体或伪造数据。

在未声明任何音质档位时，不会错误声称当前源只有 128k；保持声明为“未提供”，请求与声明验证为未知。

## 真实在线验收

[本地 Pages 真实野花 CI 41271373939](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41271373939)，**completed / success**：

- Flower KG 502、KW 200，真实媒体 HTTP 206，浏览器持续解码推进。
- 本次野花声明 KG=[128k]、KW=[128k]；实际请求 KG=128k、KW=128k。
- `declaredQualityMatch=true`，`expectedHighestDeclaredMp3=128k`。
- `actualCodec=null`，`actualBitrateKbps=null`，`mediaMetadataAvailable=false`。这是数据尚不可用的如实表达，不是检测出 128kbps。

[真实 Cloudflare Edge Preview CI 41271373918](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41271373918)，Job `124744718347`，**completed / success**：

- 部署前用 Cloudflare API 验证 `production_branch=main`，仅发布开发 Preview；无生产部署。
- Preview：`https://0ce3ea75.only-testing-online-music.pages.dev`。
- Flower KG 真实 502；用户手动查找与二次确认的 KW 真实 HTTP 200，成功使用 `sslip-full` 路由；媒体 HTTP 206，HTMLAudioElement `readyState=4`，无媒体错误，播放时间持续增长。
- 单次 KW 搜索 1 次、KW 解析 1 次、媒体请求 1 次，未自动重复；人工重试次数 0。
- KW 二次确认到音频就绪约 **3388ms**；KG 点击到播放持续推进验收约 **9325ms**（包含约 3.3 秒额外播放观察）。
- KG 和 KW 原始野花声明在这次测试均只列出 `128k`；对应实际请求 `128k`，**媒体实际编码、码率、音频指纹仍未验证**。
- Chromium CDP Media 元数据本次没有提供可用字段；仅证明音频解码和进度，不可把 `128k` 参数当作实际文件 bit rate。
- 首屏 CPU 样本 FCP ~316ms、DOMContentLoaded ~369ms；只代表这一次 GitHub-hosted Chromium 测试环境。

## 仍未解决的内容

1. 野花远端偶发 HTTP 502/404/530/403，实际 Cloudflare Edge 部分运行会 KW 失败；当前新增短 TCP 路径仅经受控测试，没有“真实 HTTP 404 后靠该路径成功解码”的证据。不能因为本轮成功就宣布上游稳定。
2. 高码率或 FLAC/Hi-Res 真正播放仍需要**来源脚本实际声明支持**，并由真实浏览器媒体与编码检测共同验证。当前原始野花在指定目标 KW 测试中只列出 128k；不修改脚本或伪造声明。
3. CDP 没有返回实际音频码率，不能声称媒体本身是 128kbps、320kbps 或 FLAC。
4. 不能从元数据匹配和持续播放证明内容与原录音同一母带或具有特定授权。
5. 性能样本只涉及 GitHub Linux Chromium；后续还需跨浏览器、用户网络与操作响应验证。
6. 正式 `main` 及生产站没有因本阶段更新。

## 下一步

- 继续比较成功路由与故障路由，保持每次测试请求次数有界、用户发起重试可追溯，坚决不自动换供应商。
- 找到确实声明 320k/FLAC 的实际 LX 音源之后，才在用户明确选择的情况下做真实解码、实际容器/码率检查；不能拿当前仅声明 128k 的脚本硬测 FLAC。
- 探索无需额外整首媒体下载的安全解码器规格检测方式；无实测值保持 null。
