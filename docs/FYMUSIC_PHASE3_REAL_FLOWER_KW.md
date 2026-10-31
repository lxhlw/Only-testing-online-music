# FyMusic Phase 3 — Real Flower KG → KW Recovery

验证日期：2026-11-01（新加坡时间）。

## 范围与禁止事项

- 仅在 `feature/fymusic-playback-verifier` 开发分支验证，**不更改或部署生产 main**。
- 真实目标歌曲仅：孙燕姿《开始懂了》。
- 使用真正的酷狗、酷我搜索接口，未经修改的原始野花 LX 脚本，FyMusic 正常的 `LXSourceManager.requestAction`、`/api/proxy` 与 Chromium 原生 HTMLAudioElement。
- 用户点击酷狗歌曲失败以后，才可显式点击“查找酷我同曲（手动）”；只有通过元数据核对并二次确认才能发起酷我解析。
- 不预填歌曲 ID、伪造解析地址、注入校准 WAV、mock 搜索、篡改原版野花脚本、绕过认证或收费限制。
- 日志不记录媒体 URL、签名、Hash、Songmid、Cookie、Token、请求完整路径或响应正文。

## 自动化测试入口

- 脚本：`scripts/diagnostics/fymusic-real-flower-kw.mjs`
- CI：`.github/workflows/fymusic-real-flower-kw.yml`
- 环境：GitHub Actions `ubuntu-latest` + Playwright Chromium + 本地 `wrangler pages dev .`，即**本地 Cloudflare Pages/Workers 模拟环境**，不是实际 Cloudflare Pages 正式生产边缘出口。
- 只有真正的 KW musicUrl 成功、HTTP 200/206 媒体响应、音频就绪且真实时间推进，才允许 CI 成功。
- 若 KG 本身已成功，不能以此替代“KG 失败 → KW 恢复”验收；若 KW 候选没有严格匹配或未产生真实媒体，也必须失败。

## 首次真实 CI 与针对性修正

首次运行：

- [Run 41229203498](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41229203498)，**failure**。
- 失败位置为 Flower 导入验收门槛，`FLOWER_IMPORT_OR_KG_KW_ACTION_UNAVAILABLE`。当时未进入真实 KG / KW 搜索。
- 随后修改测试脚本以等待 LX 源异步初始化，并增加源脚本下载响应状态与失败阶段分类。不能将首次失败称作野花 KW 播放失败，也不能仅凭一次错误确证具体导入根因。

修正提交：

- `8a44f869ea2eca57883103914f0c05ea2e0d4dae`

## 首次真实在线播放成功证据

[Run 41229317873](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41229317873)：

- GitHub Actions Job `real-flower-kw` 完成，**completed / success**，各实际执行步骤均通过。
- 原始野花 raw GitHub 传输 HTTP 200，源脚本在网页中真正初始化成功：`sourceImported=true`、`kgDeclared=true`、`kwDeclared=true`。
- 实际 KG 搜索找到孙燕姿《开始懂了》，用户选择对应歌曲，发生 KG `musicUrl` 真实解析。
- 原版野花 KG 经过 FyMusic 代理请求后收到 HTTP **502**、`FLOWER_UPSTREAM_UNAVAILABLE`。
- 失败后展示手动酷我入口；**在点击之前没有跨平台自动搜索或自动确认**。
- 用户在测试中点击手动搜索，严格元数据筛选后展示 **1** 个 KW 候选；随后再次点击“确认尝试此酷我版本”。
- 真实 KW `musicUrl` 请求发出，实际请求质量为 `128k`；`/api/proxy` 返回 HTTP **200**，触发 `fymusic:url-resolved`，实际来源 KW。
- 浏览器媒体请求收到 HTTP **206**，Content-Type 分类为音频媒体，不是 fixture。
- 浏览器实际 HTMLAudioElement：`readyState=4`、`paused=false`、`errorCode=null`、`duration=271.493333s`、`currentTime=4.321074s`、`bufferedEnd=203.434s`，并通过两次采样的推进门槛。
- 验收结论：`REAL_KW_DECODED_PROGRESS_PASS`，`actualKwAttempt=true`、`actualKwUrl=true`、`actualKwMedia=true`、`decodedProgress=true`。
- 实际本轮 KG 和 KW 解析请求为 `128k`，**不表示播放器被锁死为 128k**。质量设置、源声明与媒体实际编码仍需区分。

## 证据边界

已独立证明：**在本轮 GitHub-hosted Linux runner + 本地 Pages 模拟器的网络环境中，FyMusic 按用户显式二次确认的 KG → KW 路径获得实际野花 KW 媒体资源，Chromium 播放器解码长音频并持续推进。**

**尚未证明：**

1. Cloudflare 正式部署的实际边缘服务器出口同样可连通；`wrangler pages dev` 不等于真实 Cloudflare Edge。
2. 所有用户地区、浏览器和未来时段均可稳定解析与播放。
3. KW 真实媒体与 KG 原录音具有相同音频指纹、相同母带或拥有特定版权授权；严格元数据核对和约 271.5 秒时长不足以做此断言。
4. 真实 128k 请求返回的媒体实际编码格式与比特率。该值不能用请求参数猜测。
5. 高音质 FLAC/FLAC24bit 真正在线播放成功（现有的固定音质保留验收来自受控校准测试）。
6. 用户体感流畅、动画性能、重复播放稳定性和跨设备表现已经完成完整验收。

## 下一步

1. 对同一未修改实时脚本做独立 CI 复测，确认是否持续可重现。
2. 在不记录敏感 URL 的前提下，测量 KG 解析失败、用户点击 KW 搜索、KW 地址解析与播放器启动的端到端耗时及重复请求次数。
3. 若要验证实际 Cloudflare Edge，应使用隔离的开发分支 Preview 环境；**不得部署或合并 main**。
4. 继续保持手动搜索、严格同曲核对、二次确认、异步过期取消和用户指定音质策略，避免牺牲 Web 性能。
