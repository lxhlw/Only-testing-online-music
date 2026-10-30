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
