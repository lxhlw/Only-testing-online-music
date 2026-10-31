# FyMusic Phase 4 — Real Cloudflare Edge Preview & Playback Latency

日期：2026-11-01（新加坡时间）。

## 本阶段目标

在孙燕姿《开始懂了》单一真实目标上，核实两件事：

1. 原始野花酷狗 KG 失败后，FyMusic 用户手动查找并再次确认酷我 KW 版本，能否实际获取媒体并在浏览器解码，而不只是返回某个 JSON 或 URL。
2. 用户操作到备用音频可用的实际耗时、请求次数、浏览器长任务，以及 Cloudflare 真实边缘 Preview 与本地模拟器的区别。

禁止修改、合并或部署生产 `main`。所有改变仅在 `feature/fymusic-playback-verifier`。

## 代码与工作流

- 真实测量脚本：`scripts/diagnostics/fymusic-real-flower-kw.mjs`
- 本地模拟器真实网络 CI：`.github/workflows/fymusic-real-flower-kw.yml`
- 独立 Cloudflare Edge Preview：`.github/workflows/fymusic-edge-preview.yml`
- 添加性能与重复请求验收提交：`10a8a8cce6e4ccadeec2f4bf5cae475b43966359`
- 添加 Preview 安全工作流提交：`1bbc19f6b379f9f093484b04ee80e165cd0e9417`

真实脚本不使用 Playwright route.fulfill、不替换媒体、不给音乐搜索预填 ID、不模拟 Flower 解析，不自动跨平台播放。日志仅保留请求数量、时间、允许的质量枚举、平台、HTTP 状态和媒体对象状态；不输出媒体地址、完整上游查询、Hash、签名、Cookie、Token。

## 生产部署硬性保护

Preview 工作流只允许在特定开发分支执行。上传前必须调用 Cloudflare Pages 项目读取 API，确认当前生产分支精确为 `main`；若不能读取或生产分支不等于 `main`，立即失败并且不上传。部署命令必须指定 `--branch feature/fymusic-playback-verifier`，获得 URL 后必须拒绝正式域名。

首轮 [Actions Run 41229982116](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41229982116) 实际确认 `FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。

首轮 Cloudflare Preview 地址（真实 CI 输出）：

https://7ab95c06.only-testing-online-music.pages.dev

代码在 Preview URL 通过了 `src/fymusic-cross-platform-match.js` 资产检查。**本项目的 Preview 环境与生产环境可能共享 Cloudflare 项目名，但 Preview 非生产部署，不能宣称生产网站已更新。**

## 本地 Pages 模拟器：实际同曲实测

[Run 41229798181](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41229798181)，completed/success：

- KG Flower HTTP 502、diagnostic=`FLOWER_UPSTREAM_UNAVAILABLE`。
- 手动搜索后最多三个候选，本次严格校验通过的 KW 候选 **1** 个；用户二次确认。
- KW Flower HTTP 200；音频媒体 HTTP 206，浏览器 `readyState=4`、无错误、音频解码与时间推进。
- `flowerImport=288ms`、`kgCatalogSearch=4417ms`、`kgFailureToAlternateOffer=849ms`、`kwManualSearchToCandidates=1812ms`。
- `kwConfirmationToAudioReady=2868ms`、`kwConfirmationToVerifiedPlayback=6173ms`、`kgSelectionToVerifiedKwPlayback=8839ms`。
- 请求次数：KG Flower **1**，KW Flower **1**，KW 搜索 **1**，媒体请求 **1**；无重复 KW 搜索或二次确认触发。
- 浏览器报告 LongTask **1**，最长 **142ms**。长任务位置及成因尚未独立定位，不应据此断言来自播放或音源脚本。

## 真实 Cloudflare Edge Preview：实际同曲实测

[Run 41229982116 — Attempt 1](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41229982116)，completed/success：

- 正式 Cloudflare Pages Preview 域名；不是本地 `wrangler pages dev`，也不是正式生产域名。
- 原始野花脚本真正导入并初始化，KG/KW 两渠道可用。
- KG 搜索、实际选曲与首次 KG musicUrl 真实调用；代理 HTTP **502**，`FLOWER_UPSTREAM_UNAVAILABLE`。
- 用户点击“查找酷我同曲（手动）”才发起 KW 搜索；得到严格元数据匹配候选 **1**；第二次明确确认后 KW musicUrl 真实解析。
- 实际 Cloudflare Edge KW HTTP **200**；实际音频媒体 HTTP **206**，分类为媒体响应。
- HTMLAudioElement `readyState=4`、`paused=false`、`errorCode=null`、`duration=271.493333s`、`currentTime=4.316676s`、`bufferedEnd=202.844s`；真实时间继续推进，`REAL_KW_DECODED_PROGRESS_PASS`。
- `flowerImport=158ms`、`kgCatalogSearch=2906ms`、`kgFailureToAlternateOffer=1312ms`、`kwManualSearchToCandidates=2313ms`。
- `kwConfirmationToAudioReady=2650ms`、`kwConfirmationToVerifiedPlayback=5958ms`、`kgSelectionToVerifiedKwPlayback=9588ms`。
- 请求次数：KG Flower **1**、KW Flower **1**、KW 搜索 **1**、媒体请求 **1**。未见重复请求。
- 浏览器报告 LongTask **1**，最长 **85ms**；这是单次 GitHub-hosted Chromium 采样，不代表全部机器的帧率。

## Cloudflare Edge 第二次独立复测（失败，必须保留）

[Run 41229982116 — Attempt 2](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41229982116)，Job `124622392918`，**completed/failure**：

- 重新通过 Cloudflare 生产分支保护，重新发布非生产 Preview，预览资产检查也通过。
- 第二个真实 Preview 地址：`https://636b1d77.only-testing-online-music.pages.dev`。
- 原始野花导入成功，真实 KG 目标搜索及选曲成功，严格 KW 同曲候选 **1**，真实二次确认已经发生。
- KG Flower 代理 HTTP **502 / FLOWER_UPSTREAM_UNAVAILABLE**，符合之前模式。
- **KW Flower 代理也返回 HTTP 502 / FLOWER_UPSTREAM_UNAVAILABLE**，因此 `actualKwUrl=false`、`actualKwMedia=false`、`decodedProgress=false`。
- 浏览器无媒体响应，不能把 KW 请求发出当作成功；验收正确报 `REAL_KW_URL_OR_MEDIA_NOT_DECODED`。
- KW 搜索与 KW 解析各只有一次，没有出现重复请求放大上游压力。
- `flowerImport=327ms`、`kgCatalogSearch=3384ms`、`kgFailureToAlternateOffer=805ms`、`kwManualSearchToCandidates=1295ms`。
- LongTask 共 **1**，最长 **51ms**。本次音频尚未开始，无法报告「确认到音频就绪」耗时。
- 这证明 Cloudflare Edge 路径有**真实上游间歇性可用性问题（2次中1次成功、1次失败）**，不能以第一次成功就宣布已稳定。

针对该失败已补充脱敏的各上游路由失败分类以便下一轮区别 HTTP 400/403/404、网络失败、时限失败，不暴露原始请求路径、ID、tag 或媒体地址。

在复盘中还发现：当前界面 KG 搜索标签保持选中时，已经二次确认的 KW 候选若解析失败，原有「稍后重试」经过常规选中渠道校验可能无法重试该 KW 候选。已在开发分支修复此边界：用户可再次点击重试同一已确认的 KW 版本；不会自动换平台、重新搜索或自动无限重试，并加入浏览器回归测试。需要以最新 CI 结果确认修复有效。

## 解释和限制

1. **真实 Cloudflare Edge Preview 上，FyMusic 的 KG 失败 → KW 显式确认 → 原始野花解析 → 媒体下载 → 浏览器解码播放，至少一次完整成功**；这与之前只证明本地模拟器有效相比有实质提升。
2. 8.84s、9.59s 均为从点击 KG 到**完成持续播放观察**，包含媒体已开始后额外约 3.3s 的真实性验收；不应写成“用户必须等待这些秒数才听到声音”。KW 用户确认到音频可用的本次测量分别为 2.868s 和 2.650s。
3. 此次真实链路解析请求实际为 `128k`，是当时源声明的可选档位；不能因此将 FyMusic 全局强制锁定在 128k。FLAC / FLAC24bit 真媒体播放仍未得到证明，现有受控测试仅证明质量选择保留。
4. 有元数据匹配、约 271.5s 长音频与真实解码，**尚未完成音频指纹或人工听音校验**；不能证明内容一定是酷狗目录记录所指的同一录音，也不能证明该媒体的授权状况。
5. 尚未取得跨地区、跨浏览器、连续多天网络可用性及真实音频编码/码率比对证据。
6. 生产网站 `https://only-testing-online-music.pages.dev/` 未因本阶段而部署新代码。只能在用户明确批准后进行生产合并或部署。

## 下一步

- 复测真实 Edge Preview 是否稳定；长期稳定性不能由少数几次 CI 推断。
- 将 LongTask 与真实流程阶段关联，找出是否有不必要的主线程阻塞，并检查响应式 UI 与动画。
- 评估多浏览器与不同网络出口，继续保持超时、过期回调取消和用户手动二次确认。
- 如需测试非 128k 的真实媒体，先确认原始音源真实声明支持该品质，并分别验证实际返回编码和播放情况。
