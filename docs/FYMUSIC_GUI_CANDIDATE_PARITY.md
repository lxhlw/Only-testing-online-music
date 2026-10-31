# FyMusic — 官方 LX GUI / Web 同曲候选身份对照

## 本阶段目标与背景

历史 Windows 云端执行中，官方完整 LX Music GUI 可以重新搜索到酷狗孙燕姿《开始懂了》，显示
`00:05 → 00:08 / 04:31` 的播放器时间推进；但没有取得可证明实际解码的
HTML 媒体状态，也没有观察到请求实际音质。
另一次直接运行原始 LX v2.12.6 preload 的同曲实验，使用 **FyMusic 搜索结果**的两条酷狗候选，
两端均未取得 URL。此前并未验证 GUI 与 preload 两次测试的候选是否相同。

## 只读身份提取的代码证据

官方 LX Music Desktop 的 `src/renderer/views/Search/MusicList/useList.ts`
将搜索结果保存于 `listInfo.value.list`；
`src/renderer/components/material/OnlineList/index.vue`
向 VirtualizedList 传递 `:list="list"`；`usePlay.ts`
真正点击播放时采用 `props.list[index]`。
因此独立 CI 测试可以通过 Electron CDP **只读**访问渲染器 Vue 组件的
`props.list`，选取所点击的实际搜索行对应的数据。
没有修改官方安装包、preload、IPC、野花脚本、播放请求或音源签名。

本任务在同一 Windows GitHub Actions runner 启动本地 Cloudflare Pages 的 FyMusic，
运行真实 `LXMusicSearch.search('kg', ...)`，对相同歌名和歌手的目录候选做比较。

输出仅包含：

- Vue 列表读取是否成功、实际选中行序号、Web 候选数量
- 候选 ID、Songmid、Hash、AlbumAudioId 是否有**相等的非空值**
- 歌名、歌手、专辑、时长是否匹配
- GUI 搜索结果是否声明 flac24bit / flac / 320k / 128k
- 是否找到了强身份匹配或同专辑匹配
- `actualRequestedQuality: not_observed`，除非以后另有单独真实证据

**严格不输出**原始 ID、hash、Songmid、AlbumAudioId、签名、token、媒体地址、
Cookie、Native IPC 原始数据或音源响应正文。
只读比较结果不得被表述成真实音频内容已验证。
如果 GUI Vue 列表不可读，结果必须为未观察到，不得仅凭名字相同推断 ID 相同。

## 验证脚本及 CI

- 脚本：`scripts/diagnostics/fymusic-official-gui.mjs`
- 工作流：`.github/workflows/fymusic-official-gui.yml`
- GitHub Actions 运行：https://github.com/lxhlw/Only-testing-online-music/actions/runs/41101961058
- 开发分支：`feature/fymusic-playback-verifier`
- 正式 `main` 未修改。

## 限制

即使发现同一 ID 或 Hash，也只能确认 **目录身份数据的一致性**；
同一次实际解析音质、Native Needle 与 Web Cloudflare 代理的上游 HTTP 差异，
以及真实音频字节是否对应目标歌曲，仍需要独立证据。

## 2026-10-31 最新实测：官方 GUI 身份一致性确认

本轮只做候选数据与 GUI 只读对照，没有更改正式 `main` 或音乐播放逻辑。

连续 Windows GitHub Actions 的证据：

1. [Run 41215344861](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41215344861)：证实生产构建存在 Vue 根应用，但 DOM 不暴露 `__vueParentComponent`，且 `app._instance` 不可用。
2. [Run 41215568127](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41215568127)：改为从 Vue 3 渲染容器 `_vnode` 只读遍历 VNode/组件树，成功读取官方 GUI 真正用于列表播放的 `props.list`；实际点击的是搜索结果第 1 条。
3. [Run 41215952781](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41215952781)：按官方 LX 的真实 KG 结构提取 `meta.hash`、`meta.songId`、`meta.albumAudioId` 与 `meta._qualitys[quality].hash`，在 FyMusic 候选中得到强身份匹配。

最后一轮的脱敏一致性结论（官方 GUI 第 1 条对应 FyMusic 匹配列表第 1 条）：

| 比较字段 | 结果 |
|---|---|
| 标题、歌手、专辑、时长 | 全部匹配 |
| Songmid | 匹配 |
| 基础 Hash | 匹配 |
| AlbumAudioId | 匹配 |
| 128k 资源 Hash | 匹配 |
| 320k 资源 Hash | 匹配 |
| FLAC 资源 Hash | 匹配 |
| FLAC 24-bit 资源 Hash | Web 侧未提供可比较的值 |
| 顶层 ID | 不一致（可能是表示格式差异，原因尚未独立确认） |

注意：官方 GUI 搜索词为「开始懂了」，本轮 FyMusic 目录取数使用「孙燕姿 开始懂了」后筛选同歌名同歌手。尽管搜索词不同，三种音质资源 Hash、基础 Hash、Songmid、AlbumAudioId 全部匹配，提供了强同一目录记录证据；尚未证实两端搜索排序和完整列表完全相同。

重要限制：

- `flac24bit` 设置为首选、或 GUI `meta._qualitys.flac24bit` 存在，不等于真实请求了该音质。
- `actualRequestedQuality` 仍然是 `not_observed`。
- 官方 GUI 的 00:05 → 00:08 时间推进仍为 `UI_TIME_ONLY`，没有独立解码确认。
- 没有输出或持久化原始歌曲标识、Hash、签名、媒体 URL 或鉴权数据。

**下一独立阶段：** 只读捕获官方 GUI 实际提交给野花音源的质量档位，并对比 FyMusic 在同一候选上的实际参数；之后才能判断 Native/Web 请求头、传输层或代理出口差异。不得用音质偏好代替实际请求证据，也不得修改官方播放对象制造对照成功。

## 2026-10-31 阶段四：官方 LX / FyMusic 实际请求音质

此阶段均为真实 Windows GitHub Actions 测试，使用原始 LX Music Desktop v2.12.6 Windows release，
不修改其安装包、野花代码、IPC 函数、歌曲身份数据或媒体 URL。

- [Run 41217011164](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41217011164)：
  CDP `Debugger.setBreakpointOnFunctionCall` 只读观察 Electron `ipcRenderer.invoke`，
  仅在传入 `request_user_api` 且 `source=kg, action=musicUrl` 时保留允许的音质枚举。
  观察 12 次 IPC 调用，其中目标 `musicUrl` 实际提交 `type=128k`。
  设置界面偏好为 `flac24bit`，但**不能将偏好等同于实际请求**。

- [Run 41217360911](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41217360911)：
  再次确认官方 IPC 实际请求 `128k`。
  同一 Windows runner 上打开独立 FyMusic Web，导入未经修改的野花源，
  在真实搜索结果中仅通过强资源身份（Hash 与相应 songmid/albumAudioId）定位 GUI 对应候选，
  点击网页歌曲行以触发真正的应用解析流程。
  Web 观察：`sourceImported=true`、`matchingRow=true`、
  `declaredQualities=["128k"]`、`requestedQualities=["128k"]`、
  `proxyRequests=1`、`initialRequestQualityParity=true`。

**已验证：** 官方 GUI 与 FyMusic Web 选择的是强身份匹配的酷狗资源，
并且在本轮实际播放请求中两端的初始音质均为 `128k`。
这不构成未来统一锁定 128k 的理由：当前野花对 KG 声明只有 128k；
如其他有效授权音源提供高质量，应允许按其声明选择高质量音频。

**尚未验证：**
- 原版 LX 的音频字节是否真被解码，以及是否完整/准确对应指定歌曲。
- 原版 LX Native Needle 网络链路的实际 HTTP 请求与响应状态。
- 本轮 Web 代理请求的具体状态码与错误分类（只观察到 HTTP 请求发生）。
- Native 与 Web 之间 DNS、代理转发、headers、重定向、出口等差异。

下一阶段只针对**同一身份、同一音质**进行只读网络路径对照：
观测 Native Needle 与 Web 代理各自的安全状态类别及失败位置，
日志禁止输出原始歌曲身份、签名、Cookie、Token 或媒体 URL。
优先排查 HTTP 400/403/404/502 的分层来源；不要将 UI 时钟推进表述为解码证明。

## 2026-10-31 阶段五：网络失败位置与 HTTP 状态（已实测）

[Windows Run 41218702093](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41218702093) 在开发分支运行，并保留此前强身份、实际音质对照：

- 官方 LX GUI：目标酷狗歌曲候选第 1 条，实际 IPC 请求 musicUrl type=128k，UI 时间推进，但没有独立媒体解码证明。
- FyMusic：真实浏览器中选中与 GUI 相同 Hash 且 Songmid/AlbumAudioId 对应的歌曲；野花声明 KG 仅支持 128k，网页确实提交一次同质量解析请求。
- **Web 浏览器收到** /api/proxy HTTP **502**，诊断代码 FLOWER_UPSTREAM_UNAVAILABLE。
- **Worker canonical-socket**（访问原始野花 HTTP IP）得到 FLOWER_SOCKET_HTTP_404。
- **同一 Windows runner 的单独 Node/Needle 探针**对 FyMusic 浏览器刚提交的**同一原始野花 URL** 直连，得到实际 HTTP **404**。
- Worker 其他尝试：nip-full、sslip-full 得到 HTTP 404；nip-short、sslip-short 得到 HTTP 403；ts-short、ts-full、tm-short、tm-full 报 NETWORK_ERROR。
- 因此 502 是 **Cloudflare 代理聚合失败后的错误码**，不是原始野花 IP 直接返回的状态码。

### 证据边界

1. 独立 Node/Needle 探针不等于官方 LX 进程的原始 Needle 网络请求。它只验证**测试时 Windows runner 对 Web 发出的原始 URL 的独立可达性**。不能推断用户本地电脑、其他网络出口或其他时刻也必然 HTTP 404。
2. 此次网页 Worker 和独立 Node 探针都命中 HTTP 404，支持“上游此路由没有返回音乐解析结果”的结论；不说明原版 LX GUI 采用了相同的 URL、Headers、重定向或 IPC 回调参数。
3. 抓取器仅记录 HTTP 状态、经允许列表过滤的路径别名、错误分类和音质枚举。原始 URL、歌曲 ID、Hash、签名、Cookie、Token 和响应正文未写入报告。
4. 对官方 GUI，“播放器时钟推进”依旧只有 UI_TIME_ONLY 证据。音频真实解码、可听性以及是否播放目标录音尚未确认。

### 下一阶段决策

**先验证官方 LX 进程真实 Needle 请求与 FyMusic Web 上游请求的参数差异**，优先检查请求地址类别、实际源版本、Host / UA / Referer / Accept 的*存在性*、状态码和是否有重定向，不收集原始鉴权数据。当前证据不支持为此强制锁定 128k、修改歌曲标识或将所有 404 重试为 502。若原始服务器在特定出口持续 404，应明确归类“音源/区域/上游不可用”，停止无意义的多次重试，而不是让 UI 卡住。

## 2026-10-31 阶段六：官方隐藏音源窗口、Native HTTP 与跨平台尝试

本阶段直接观察原版 LX Music Desktop v2.12.6 未修改的 Windows 官方程序（不是自制 Native 替代 harness），
在被点击的酷狗搜索结果上采用未经修改的原始野花音源。所有修改只存在于 FyMusic 开发分支的 CDP 诊断脚本中。

### 验证运行

- [Run 41220789019](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41220789019)：官方 LX 导入野花之后，CDP 枚举到独立的 data: 目标，属于隐藏 User API BrowserWindow；此外有主 file: GUI 页面和两个 Worker。
- [Run 41221112332](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41221112332)：在隐藏窗原始 lx.request 安装只读函数断点，检测到两次调用，但由于 Electron contextBridge 包装层，固定位置参数读取失败。
- [Run 41221407012](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41221407012)：上层调用帧显示 wrapper 参数长度 4，首项是 function，不能把首项当 URL。
- [Run 41221681503](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41221681503)：官方更新日志关闭按钮在 CI 视口之外，属于 UI 自动化基础设施失败，未执行音乐测试；随后在脚本中调用原官方按钮的 click 事件修复。
- [Run 41221903783](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41221903783)：成功识别实参位置 URL=1、callback=3；原版 lx.request 实际请求野花原始 IP 的酷狗解析 GET，显式 User-Agent 存在，Referer/Accept/Origin/Cookie/Accept-Encoding 未显式传递。
- [Run 41222200361](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41222200361)：在原版隐藏窗口中获得 HTTP 400 和 200 回调；Web 代理最终 HTTP 502；两端显式请求头字段的存在性一致。
- [Run 41222516442](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41222516442)：证实原版 LX 真实访问野花原始 IP 的 **KG（酷狗）** 和 **KW（酷我）** 两类 URL 解析路径。
- [Run 41222857079](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41222857079)：最终复测通过，事件记录顺序是 **KG 请求 → HTTP 400 回调 → KW 请求 → HTTP 200 回调**。原版 LX KG 上游 URL 与 FyMusic Web KG 上游 URL 经过本进程内私有摘要比较，**exactNativeKgUrlMatch=true**。Web 只发起 KG 请求，最终代理 HTTP 502（本轮 canonical-socket 的上游为 HTTP 404），独立 Node/Needle 探针对网页使用的相同原始 URL 直连也为 HTTP 404。

### 已证实结论

1. 桌面 LX 目标歌曲不是因为不同搜索结果或 128k/FLAC 音质选择而与 Web 产生差异：已经验证歌曲身份强匹配、实际请求音质相同，而且 **KG 的完整原始上游 URL 完全一致**。
2. 源头请求行为不同：**官方 LX 在 KG 解析尝试之后还发送了 KW 请求**；目前的 FyMusic Web 对照限定同平台 KG，因此没有这条跨平台请求。这是一个可复现的关键行为差异。
3. Native 隐藏窗回调见到 HTTP 400 和 200，时序支持 KG 失败之后 KW 返回成功 HTTP 响应的解释；但调试断点是**复用回调函数**，单条回调到单条请求的最终对应关系还未严格绑定，不能仅依赖时序断言 200 一定属于 KW。
4. HTTP 200 仅表示服务器响应成功，**没有独立验证完整有效媒体播放 URL、正确录音、音频字节解码或可听结果**。官方 GUI 时钟推进只能作为 UI 级证据。
5. Web 的 502 是代理聚合失败；原始野花上游在不同调用及网络出口下曾返回 400 或 404。需要避免将不同的上游状态混称为“代理本身返回 404”，也不能认定所有环境都永久失败。

### 后续技术决策

先在测试中**验证原版 KW 的 HTTP 200 是否包含可用媒体 URL、是否触发官方播放器真实解码**，
并验证是否是原版播放流程的跨平台回退而非另一个独立请求。若证实，再考虑 FyMusic 开发分支加入
**可见、可配置、同歌信息严格校验的跨平台备用音源选项**，不可静默替换所选歌曲/平台，不应牺牲页面流畅度。
默认仍尊重用户指定平台；仍然保留音源实际支持的高音质（320k/FLAC/FLAC 24-bit），不得锁死 128k。
不要在成功播放和音频身份验证前修改生产 main、宣称已经修复或上线。
