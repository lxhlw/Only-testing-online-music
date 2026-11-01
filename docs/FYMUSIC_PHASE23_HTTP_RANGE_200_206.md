# FyMusic 第 23 阶段 — 原生 audio.src 的 RFC 7233 Range 与 HTTP 200 对照

日期：2026-11-01（Asia/Singapore）

## 1. 本阶段目标与可证结论

在**同一份项目授权 MP3 校准音频、完全相同的初始分块和传输间隔**下，比较浏览器原生 `audio.src` 使用 HTTP 200（忽略 Range）和 RFC 7233 HTTP 206（响应 Range）时的真实开播及缓冲行为。检查原生浏览器实际发出的 Range、服务器的响应头、真实字节切片、音频播放进度和网络恢复情况。

**最终两套完整 CI 均成功**，两种模式均真实开始解码、在响应尚未完成时播放，在播放至约 8.12 秒时自然进入 `waiting`、`stalled`，界面显示缓冲提示，并在恢复网络字节后继续 `playing` 和播放进度。

不能据此宣称 Range 必然更快或会修复第三方歌曲：本地的 Range 更快，Edge 的 Range 更慢，均为单轮样本；没有做统计学重复实验。

## 2. 安全边界与 Git 状态

仓库：`lxhlw/Only-testing-online-music`

- 开发分支：`feature/fymusic-playback-verifier`。
- 本阶段全部功能测试对应提交：`abc9e30b219854967b6e456e86160ad4712c5b7a`。
- 生产 `main` 仍为：`c9a496ab580fb54775721b93a3944800bcaefc44`。**未修改、未合并 main，也未部署正式站。**
- 未修改生产播放器 `src/app.js`、`src/player-controls.js`、平台身份、音质选择、上游签名/解析、跨平台回退逻辑，也没有新增第二播放器、MSE、自动重播或生产环境计时器。
- 原始数据是此前授权的 209 字节 MP3 校准帧重复 1600 次，共 334,400 字节（约 41.8s），而非任何商业音乐 URL。没有测试孙燕姿《开始懂了》或野花/酷狗上游真实播放。用户此前决定暂缓这些上游问题，保持不变。

## 3. 实际文件变更

1. `functions/api/fymusic-range-selftest.js`：新增 QA-only `mode=primed-range`。其音频字节和 `mode=primed` 完全一致，支持经白名单验证的初始帧和间隔参数；区别仅在于该新模式执行 Range 解析、返回带 `Content-Range` 的真实 206，处理无效范围 416，而不是忽略 Range 返回 200。
2. `scripts/test-fymusic-phase23-range-compare-browser.mjs`：先通过 HEAD/GET 检查 RFC 7233，包括 `bytes=0-63`、`bytes=-16`、`bytes=200000-200031`、无效范围以及 MP3 头部 `FF FB`；然后复用页面现有唯一 `#audio`，通过真实网络流与 `src/fymusic-media-evidence.js` 的有界事件采样器，对两种模式进行逐一原生播放观察，记录媒体请求发出的 Range、实际 HTTP 状态和事件顺序。
3. `.github/workflows/fymusic-playback-verifier.yml`、`.github/workflows/fymusic-ui-preview.yml`：加入新测试的路径过滤、语法检查、实际本地 Chromium 和隔离 Cloudflare Edge Preview 步骤；此前所有回归保留。

## 4. 相同测试参数

- `format=mp3`，`leadFrames=460`（约 12 秒压缩音频），`gapMs=11000`（HTTP 流在交付前置字节后真正等待）。
- 模式 A：`mode=primed`；`Accept-Ranges: none`；浏览器尽管发送了 `Range: bytes=0-`，服务器忽略它并以 HTTP 200 完整数据流返回。
- 模式 B：`mode=primed-range`；`Accept-Ranges: bytes`；浏览器发送 `Range: bytes=0-`，服务器实际返回 HTTP 206 和 `Content-Range: bytes 0-334399/334400`。
- QA 媒体 URL 各自独立，浏览器真实 HTTP 流不会被独立验证请求替换；未模拟或派发原生媒体事件。
- 独立 fetch 实测收到全部 334,400 字节，网络最大分块间隔均约 10,996–10,998ms，防止把预缓冲行为和虚构的限速混淆。

## 5. HTTP Range 合规实测

对 mode B：

| 请求 | 实际结果 |
|---|---|
| HEAD，无 Range | 200，`Accept-Ranges: bytes` |
| GET `Range: bytes=0-63` | 206，`Content-Range: bytes 0-63/334400`，实收 64 字节，MP3 头 `FF FB` |
| GET `Range: bytes=-16` | 206，`Content-Range: bytes 334384-334399/334400`，实收 16 字节 |
| GET `Range: bytes=200000-200031` | 206，`Content-Range: bytes 200000-200031/334400`，实收 32 字节 |
| GET 不可满足范围 | 416，`Content-Range: bytes */334400` |

对 mode A，浏览器 Range 请求实际收到 200 全文件；不把 200 路径假冒成 Range 支持。

## 6. 真实音频表现

| 证据 | 本地 HTTP 200 | 本地 HTTP 206 | Edge HTTP 200 | Edge HTTP 206 |
|---|---:|---:|---:|---:|
| 首次原生 playing | 34ms | 26ms | 37ms | 93ms |
| 首次真实播放进度 | 534ms | 552ms | 536ms | 618ms |
| 中途 waiting 次数 | 1 | 1 | 1 | 1 |
| 等待时媒体位置 | 8.12s | 8.12s | 8.12s | 8.12s |
| 自然恢复次数 | 1 | 1 | 1 | 1 |
| 重新缓冲总时长 | 2,821ms | 2,832ms | 2,818ms | 2,837ms |
| 网络最大分块间隔 | 10,998ms | 10,998ms | 10,996ms | 10,996ms |
| 下载完成前真实播放 | 是 | 是 | 是 | 是 |
| FyMusic 等待提示 | 正常 | 正常 | 正常 | 正常 |
| 音频错误码 | 0 | 0 | 0 | 0 |

**重要解释：** 此单次测试说明 Range 在当前条件下不会妨碍真实播放、自然等待和恢复。两套环境首次播放时间的快慢顺序不一致，因此不能因一次 CI 就断言 HTTP 206 在整体上更快或更稳定。要比较性能分布，需要多轮无缓存、随机顺序、多个独立运行的统计测试。

本阶段采样器通过 `dispose()` 清理；每条测试最多保存 56 个事件，保留聚合数，且没有额外生产轮询。仅 QA 页面测试调用。

## 7. CI 与隔离 Preview 证据

- 本地完整 Chromium：[Run 41316102082](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41316102082)，`completed/success`。
- Cloudflare 隔离 Edge Preview：[Run 41316102098](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41316102098)，`completed/success`。
- 隔离部署 URL：**https://ad02f95a.only-testing-online-music.pages.dev**。
- Edge 工作流通过生产保护：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。
- 真实日志标识：`FYMUSIC_PHASE23_RANGE_VS_200`、`FYMUSIC_PHASE23_RANGE_CONTRACT_PASS`。
- 第 1–22 阶段的原有浏览器/安全/性能/Range/缓冲相关回归均保留并通过。

本阶段功能/测试 HEAD `abc9e30b219854967b6e456e86160ad4712c5b7a` 对应以上 CI。随后提交的本交接文档不改变任何可执行代码。

## 8. 保留的问题与下一阶段

1. **第三方音乐上游仍未通过验证**：真实野花、酷狗地址、孙燕姿《开始懂了》并非本阶段测试材料，不能声称修复了真实源的 400/404/502 问题。
2. 仍未测真实 AAC/FLAC 等格式、真实商业 MP3 编码和元数据复杂度、多个系统/设备；对不同编码和 Range 的兼容性不作泛化。
3. 本地与 Edge 均是 CI Chromium；未验证锁屏、运营商移动网络或持续数小时的实际播放。
4. **建议第二十四阶段**：对 HTTP 200/206 做小规模重复运行，比较启动与恢复指标的分布并测缓存/顺序影响；仍以不改变生产播放器为原则。也可扩展合法测试容器或真实设备矩阵（应使用有授权的音频材料）。
5. 无法通过单一播放阳性推断 FyMusic 的野花解析已解决。保持不强制 128k、不自动跨 KG/KW 替代、不兼容 Android 4.4.2 的既定原则。
