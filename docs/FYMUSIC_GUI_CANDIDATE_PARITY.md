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
