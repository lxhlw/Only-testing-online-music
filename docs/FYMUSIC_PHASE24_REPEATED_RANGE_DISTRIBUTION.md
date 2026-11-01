# FyMusic Phase 24 — Repeatable, Counterbalanced Native HTTP 200/206 MP3 Startup Evidence

日期：2026-11-01（Asia/Singapore）

## 1. 核心结论

基于第二十三阶段的单次 HTTP 200/206 对照，本阶段进一步进行 **本地 Chromium、Cloudflare Edge Preview 各 8 次**独立的浏览器原生音频播放对照（两种传输方式各 4 次，共 16 次真实播放）。每次均使用全新浏览器上下文、唯一 URL、`Cache-Control: no-store, no-transform`、非 Service Worker 响应，并使用同一个 `#audio` 元素实际解码同一份项目授权 MP3 音频。

**两套完整 GitHub Actions 均为 `completed/success`。** 16/16 次真实观察到：下载完成前开播、真实网络暂停约 11 秒、播放中途原生 `waiting`、恢复的 `playing`、以及 FyMusic 自己的缓冲提示。HTTP 200/206 均能稳定执行这些受控场景下的播放行为。

本轮 HTTP 206 的启动中位数比 HTTP 200 低（本地 15ms 对 17.5ms；Edge 32ms 对 63ms），但样本非常小，Edge HTTP 200 存在一次 188ms 样本；**不能据此宣布 206 具有统计显著或普适的速度优势，也不修改生产播放器策略。**

## 2. 隔离与仓库状态

- 仓库：`lxhlw/Only-testing-online-music`
- 开发分支：`feature/fymusic-playback-verifier`
- 本阶段经完整 CI 验证的代码提交：`ff3b7b67cec0fc1e4ff9c4f7cc7e64a7afe136bc`
- 生产 `main`：`c9a496ab580fb54775721b93a3944800bcaefc44`，本阶段未更改、合并或正式部署
- `src/app.js`、`src/player-controls.js`、线上平台解析、歌曲身份、音质选择及生产播放器核心均未修改
- 保持单个 `#audio`、不使用 MSE、不伪造媒体事件、不改变真实歌词/进度/音乐来源、不增加生产环境持续轮询或额外网络请求
- 音频只来自现有自有/授权校准 MP3 测试帧；没有向野花、酷狗或第三方商业音乐服务发起请求。用户指定的真实人工歌曲仍为孙燕姿《开始懂了》，本阶段没有验证该歌曲

## 3. 测试文件和技术实现

1. `functions/api/fymusic-range-selftest.js`：对 QA-only `mode=primed` 与 `mode=primed-range` 扩充受控 `gapMs` 白名单（`5500|11000|16000`），所有旧参数及此前测试行为保持兼容；本次运行仍固定使用 `gapMs=11000`。
2. `scripts/test-fymusic-phase24-repeated-range-browser.mjs`：全新独立 QA 回归。固定 460 帧前置 MP3、总长 334,400 字节、11 秒 HTTP 暂停。将 200/206 交错成四对，依次执行 `200,206,206,200,206,200,200,206`。
3. 每次使用新的 Playwright 浏览器上下文和唯一媒体 URL；同时启动与原生媒体请求独立的真实 HTTP 流读取，测量分块间隔、收取总量、响应 200/206 与 Content-Range；媒体必须由真正的 `audio.src` 下载/解码，不能使用 fetch 转成 Blob 或经由 MSE 驱动。
4. 使用此前有界 `src/fymusic-media-evidence.js` 记录真实 `playing`、`timeupdate`、`waiting`、`stalled` 和网络恢复 `playing`；最多保留 48 条事件，在每轮结束调用 `dispose()`，不采用伪造的音频事件、跳时或媒体状态。
5. 运行时通过 Playwright 检查每轮实际原生媒体请求的响应状态、`cache-control`、`response.fromServiceWorker()` 以及真实请求完成时间。严格要求实际响应在播放开始时尚未完成、没有页面异常及 MediaError、中途等待和正常恢复、缓冲 UI 实际显示。全部通过才输出最后标识。
6. 两套 Actions 工作流增加路径检测、脚本语法检查和新回归步骤；第 1–23 阶段的旧测试一项未删除。

## 4. 真实测试结果

所有启动时间均以单次实验中安装有界事件监听器时为时间基准。单次跑数受到真实浏览器调度、网络/边缘节点和运行环境影响，并非对真实用户端的保证值。

### 首次原生 `playing`（毫秒）

| CI 环境 | HTTP 200 四次原始样本 | HTTP 200 中位数 | HTTP 206 四次原始样本 | HTTP 206 中位数 |
|---|---|---:|---|---:|
| 本地 Chromium | 40, 15, 20, 14 | 17.5 | 15, 11, 15, 19 | 15 |
| Cloudflare Edge | 80, 44, 46, 188 | 63 | 50, 26, 22, 38 | 32 |

### 首次实际播放进度与缓冲耗尽恢复

| CI 环境/响应 | 首次 `timeupdate` 中位数 | 重新缓冲时长中位数 | 中途等待及恢复 |
|---|---:|---:|---:|
| 本地 HTTP 200 | 535ms | 2,835.5ms | 4/4 |
| 本地 HTTP 206 | 538.5ms | 2,840ms | 4/4 |
| Edge HTTP 200 | 577.5ms | 2,835.5ms | 4/4 |
| Edge HTTP 206 | 552.5ms | 2,836.5ms | 4/4 |

真实网络中断记录以约 11 秒为主；Edge 有一轮 206 探针观察到 11,305ms 的较大分块间隔，证明边缘环境仍有自然波动。

### 交错配对差值

定义差值：`首次 playing(206) - 首次 playing(200)`，负值表示该对里的 206 较快。

| 配对 | 执行顺序 | 本地差值 | Edge 差值 |
|---:|---|---:|---:|
| 1 | 200 → 206 | -25ms | -30ms |
| 2 | 206 → 200 | -4ms | -18ms |
| 3 | 206 → 200 | -5ms | -24ms |
| 4 | 200 → 206 | +5ms | -150ms |

本地第 4 对方向逆转；Edge 第 4 对明显受 200 模式的 188ms 样本影响。因此结果最多能支持**这组受控样本中启动分布不同**，不能直接得到针对普通用户的优化决策。

## 5. 网络和缓存证据

- 四次 200、四次 206，每个环境均真实通过对应原生音频请求返回的 200 或 206；Range 模式记录 `Content-Range: bytes 0-334399/334400`，每轮实际收取 334,400 字节。
- 16 轮全部记录实际响应 `cache-control: no-store, no-transform`、`serviceWorker=false`、`failed=false`、`finished=true`。
- 每轮媒体 URI 都唯一，且 Playwright 上下文新建，因此不会正常重用此前样本的浏览器媒体缓存；没有据此宣称已经排除所有云端网络波动或跨地域缓存机制。
- 每轮都确实在原始媒体请求完成前开始播放，之后发生播放中途等待并自然恢复；缓冲提示出现，真实进度继续向后推进。
- 所有检验不依赖生产播放器额外埋点或远程数据传输。

## 6. 自动化验收与独立 Preview

- 本地完整 Chromium：[Run 41317128380](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41317128380) — `completed/success`。
- Cloudflare Edge 完整回归：[Run 41317128339](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41317128339) — `completed/success`。
- 本阶段隔离 Edge Preview：**https://ca3d8292.only-testing-online-music.pages.dev**
- 生产分支部署保护：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`
- 新增标识：`FYMUSIC_PHASE24_REPEATED_RANGE_DISTRIBUTION`、`FYMUSIC_PHASE24_ORDER_CACHE_ISOLATION_PASS`
- 此阶段新增的技术文档在功能 CI 全绿后独立提交，不更改生产或 CI 运行代码；因此两个运行 ID 对应功能提交而非后续的 docs-only HEAD。

## 7. 风险、限制与后续方向

1. 目前只有每环境每模式 4 次样本，数据不能支持置信区间较窄的性能结论、显著性、生产默认策略或码率优化。且测试对象仍是重复编码 MP3 校准帧，不代表合法不同音质格式的行为。
2. 结果覆盖的是同类 Chromium 桌面 CI 浏览器环境和 Cloudflare Edge 部署，尚非真实 iOS/Android 设备、锁屏环境、运营商移动弱网或播放器长期使用。
3. HTTP 206 已证明支持标准字节范围，且在固定测试场景中未损害解码、进度、缓冲和恢复；这不代表实际野花/酷狗上游可访问或可正常签名。
4. **第二十五阶段建议**：从受控的真实 HTTP 流扩展到其他获得授权的真实编码音频格式（例如 AAC / FLAC）和更接近实际音乐文件的元数据布局；对每种格式明确预期浏览器支持矩阵。在安全边界明确前不动生产播放架构。
5. 若需要进一步估计 HTTP 200/206 的稳定性能差异，应安排更多独立重复、跨时间段的对照，而非依赖四次样本。
6. 始终保留既定硬约束：不强制 128kbps、不做未授权的跨平台自动回退、不为 Android 4.4.2 做旧兼容、不修改正式站主分支；用户未要求重启酷狗故障排查，故本阶段没有打开该问题。
