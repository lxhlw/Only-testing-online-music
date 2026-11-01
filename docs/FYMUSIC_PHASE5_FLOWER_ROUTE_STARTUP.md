# FyMusic Phase 5 — Flower upstream route compatibility & startup CPU evidence

日期：2026-11-01（新加坡时间）

## 范围和安全边界

- 仅修改 `feature/fymusic-playback-verifier`；禁止修改、合并、部署生产 `main`。
- 真实目标固定为孙燕姿《开始懂了》，真实野花用户脚本固定为未修改的 `pdone/lx-music-source/main/flower/latest.js`。
- 不模拟真实媒体、不假设有版权授权、不捏造解析地址或高品质链接。
- 保持 KG 失败后**用户手动搜索 KW → 严格元数据校验 → 用户二次确认**。KW 失败后只有用户主动点击「稍后重试」才能再次请求。
- 日志不输出完整代理 URL、Song ID、Hash、签名、Cookie、Token、媒体地址、响应正文或任意来源脚本内容。
- 取消 Android 4.4 兼容目标；继续以现代浏览器流畅度、响应性、音频加载正确性为目标。

## 真实 Edge 的故障证据：不可将所有 502 混为一谈

[Run 41269934925](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41269934925)，真实 Cloudflare Preview，**失败**：

- 原始野花成功导入，KG/ KW 目录可搜索、严格同曲候选 1 个，用户点击二次确认。
- KG Flower HTTP 502，KW Flower 第一次 HTTP 502，人工触发重试后 KW 第二次仍 HTTP 502，未产生媒体文件。失败必须保持红色 CI。
- 失败的 KW 原始 TCP 为 `FLOWER_SOCKET_HTTP_404`；`ts`/`tm` 别名 HTTP 530，`sslip`/`nip` 有 HTTP 403、404 等。
- KW 解析请求总计 2 次，其中第 2 次是明确点击「稍后重试」，不是自动重试或无限重试。
- 证据不能证明服务器已永久下线，更不能推断错误是歌曲权限、音源脚本签名或地区限制中的哪一种。

[Run 41270070424](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41270070424)，另一真实 Edge Preview，**失败**：

- KG、KW 首次与 KW 手动重试真实代理均返回 502。
- KW 原始 TCP HTTP 404，别名 HTTP 530/403/404，真实媒体请求 0。
- 失败后启动 Profile 步骤并成功打印首屏性能证据，证明诊断工作流不会把媒体失败静默改为成功。

[Run 41269951170](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41269951170)，真实 Edge **成功**：

- KG Flower HTTP 502；KW Flower HTTP 200；实际媒体 HTTP 206，持续播放解码成功。
- 本次明确成功的野花路由是 `canonical-socket`，即原始 IP TCP。
- 浏览器长任务有 3 次，包括初始化、KG 搜索及 KW 解析阶段的一次 120ms；因此“所有卡顿只发生在首屏”不是普遍成立的结论。

## 实施的改进

### 1. 成功路由脱敏标记

在 `functions/api/proxy.js` 成功的真正野花响应上添加安全枚举 `X-FyMusic-Flower-Route`，客户端诊断仅接受固定路由标签。失败继续使用已有的最多 10 条固定路由/错误码分类。

这样可比较“哪条连接路径成功”与“全部路径失败时的类别”，不泄露请求体或地址。

### 2. 仅在原始 TCP HTTP 404 后尝试同提供者短路径

- 常规路径：`http://97.64.37.235/flower/v1/url/...`
- 有条件备用路径：相同原始 IP 的 `http://97.64.37.235/url/...`
- 只有常规原始 TCP 明确返回 HTTP 404 且路径以 `/flower/v1/` 开头，才在同一用户请求的 9 秒总预算内尝试。
- 仍携带原用户脚本提供的 LX 请求头；不更换供应商、不改歌曲身份/音质、不自动重试整首歌。
- 若正常路径返回 400/502、网络故障或其他错误，不能绕过错误执行这条短路径。
- 失败仍严格为 502；没有媒体不允许通过真实播放 CI。

受控验证文件：`scripts/test-fymusic-canonical-short-socket.mjs`。覆盖“原始 404→短路径 200”、“原始 400→绝不执行短路径”、“短路径失败→安全分类”、相同 IP、tag 与原始 LX 协议保留。

### 3. 每阶段 LongTask 统计 + 首屏 CPU 采样

- `scripts/diagnostics/fymusic-real-flower-kw.mjs` 的 Chromium PerformanceObserver 采集不超过 128 条匿名 LongTask 时间，按首屏、导入、KG 搜索、KG 解析、KW 搜索、KW 解析、人工重试、播放阶段归类。
- `scripts/diagnostics/fymusic-startup-profile.mjs` 使用 Chromium CDP Profile，只输出经过白名单过滤的本项目脚本或 vendor 函数名称与采样量，不保存原始 profile 或包含 query 的脚本 URL。
- 修复 CPU 统计陷阱：V8 idle / program 样本没有脚本 URL，不能错误当作 “inline JS 耗时”。

## 第一次带兼容短路径的真实 Cloudflare Edge

[Run 41270227757 — Attempt 1](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41270227757)，**completed / success**：

- 原始 Flower 导入成功，KG 真实 502，KW 真实 200，媒体 206，解码推进通过。
- KW 成功路由为 `sslip-full`，不是 `canonical-short-socket`。因此这是修复后完整链路的回归成功，**不是短路径已经在真实 Edge 起作用的证据**。
- KG/ KW 宣告质量本次均为 `128k`。不将其描述为播放器永久限制音质；另一独立 CI 有过返回声明列表为空的情况。
- KW 二次确认到音频就绪 **1988ms**；KG 点击到完整持续播放验收 **7922ms**；无额外 KW 请求。
- LongTask 1 次 90ms，在首屏初始化阶段。首屏 Chrome CPU 采样：First Contentful Paint 348ms、DOMContentLoaded 468ms、筛除 idle 后的本项目/ vendor 栈自采样约 35ms。统计是单次 GitHub Linux runner 采样，不等于全设备/全用户帧率。
- CI 中受控短 TCP 单元测试也通过，日志 `FYMUSIC_CANONICAL_SHORT_SOCKET_UNIT_PASS`。

本次独立 Preview 地址：

https://bc987277.only-testing-online-music.pages.dev

## 未解决事项和后续安全验证

1. 在真实 Cloudflare Edge 出现原始 Flower `HTTP 404` 的窗口时，新 `canonical-short-socket` 是否能够真正返回可解码音乐，**尚未证明**。不能把受控单元测试当作真实恢复率提升。
2. 当所有同一野花路由均返回 400/403/404/530 时，FyMusic 无法保证自行恢复；应继续显示可理解的失败信息和用户自愿重试，不应暗中更换服务器或伪造歌曲。
3. 用户要求不强制锁 128k：现有实测中原始野花有仅声明 128k 或声明为空的情况，不能据此创造不被声明支持的 FLAC/320k 流；高品质真实测试仍需有实际声明支持的源。
4. 更多浏览器和真实地区的稳定性没有验收；CDP CPU Profile 属于采样诊断，并不等于产品性能评分。
5. 生产 `main` 没有因本阶段被修改或部署。
