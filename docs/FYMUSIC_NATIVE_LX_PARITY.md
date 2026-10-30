# FyMusic — 原始 LX Desktop preload 与 Web 同曲对照（Windows）

## 运行证据

- Workflow: [FyMusic v2.12.6 Native Preload Parity (Windows)](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41098977465)
- 运行环境：GitHub Actions `windows-latest`，Windows Electron + Chromium。
- 原始 LX Music Desktop：v2.12.6，源码提交 `ad95d5091c9ed689fa72b5e5c849df65f5a679ce`，官方 **原始 preload**。
- 官方 preload SHA-256：`bff900403fcdd2a3ee3886d044a501ef1a109568af725752cf7ee963d83134bc`。
- 野花原始脚本 SHA-256：`15c166987edde41cf5917b3160c0ab253ff17e5e6bc6765c9eaa11a822c4aa97`。
- 搜索：FyMusic 真实搜索，孙燕姿《开始懂了》；不模拟搜索结果。
- 每组分别使用相同 musicInfo、相同平台、同一原始野花脚本与野花运行时声明的 `128k` 音质。
- 整个测试在 GitHub 云端执行，没有使用用户本地计算机，也没有部署正式网站。

## 2026-10-31 结果

| 平台与候选 | FyMusic Web musicUrl | 官方原始 LX preload musicUrl | 官方 preload 媒体证据 |
| --- | --- | --- | --- |
| KG #1 | URL_FAILED | URL_FAILED | 未获得 URL |
| KG #2 | URL_FAILED | URL_FAILED | 未获得 URL |
| WY #1 | URL_RETURNED | URL_RETURNED | `AUDIO_PLAYED`，3.3 秒进度，271 秒总时长 |

- Windows 原始 preload 对酷狗的两个候选均返回 `URL_FAILED`，错误分类为 `OTHER`，错误文字长度均为 4，但没有记录原始错误文本。
- 由于本阶段没有捕捉 native Needle 实际出站 HTTP 响应，**不能将 preload 的 `OTHER` 直接解释为 HTTP 400**；Web Cloudflare 代理在此前独立 Linux 运行中曾观察到 Flower canonical TCP 的 HTTP 400，属于不同运行环境的独立证据。
- 同轮 WY 的 Web URL 解析成功，Windows 原始 Electron preload 获得 URL 并观测到约 3.3 秒解码后播放进度，证明 Windows 原生脚本不是全部初始化失败。
- 这是一项真实 official preload/IPC 测试，但**不是完整未修改 LX GUI 操作测试**。完整 GUI 可能使用不同搜索结果版本、质量设置与附加客户端状态；因此不能由本测试宣称官方 LX Music 完整 GUI 里的同一首歌必定失败。
- 失败的 KG 两条候选也不等价于用户 Windows 机器上历史可播放的具体版本，无法验证两者 song ID 一致。

## 本轮判断与下一阶段

- **可支持：** FyMusic 的独有浏览器解码逻辑不是这两条 KG 候选失败的直接原因，因为原始 LX preload 同样在 musicUrl 阶段失败，解码尚未开始。
- **尚未证明：** 上游故障、请求签名规则、出口 IP/ASN 地域、原始 GUI 与 preload 的数据差异哪一个是决定性原因。
- 下一小阶段建议沿用官方 v2.12.6 完整 GUI 自动化，在官方 GUI 中重新搜索酷狗目标歌曲并显式刷新每个搜索渠道，再观察真实选择的候选身份是否与 FyMusic 的候选一致。对照数据只保存允许的形状、哈希相等布尔值和安全状态，不存 raw IDs、签名或媒体 URL。
- 不做无证据的 128k 强制、随机换歌或绕过第三方权限验证。
