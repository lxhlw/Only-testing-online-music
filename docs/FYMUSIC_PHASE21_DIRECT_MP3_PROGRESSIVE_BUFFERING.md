# FyMusic 第 21 阶段 — 普通 audio.src 的真实渐进式播放、缓冲耗尽与恢复

日期：2026-11-01（Asia/Singapore）

## 1. 核心结论

第二十一阶段已通过**两套真实 Chromium 运行环境**（本地 Wrangler / Cloudflare Edge Preview）证明：在有足够初始 MP3 数据、后续 HTTP 传输暂停的条件下，**不使用 Media Source Extensions（MSE）的单一原生 HTMLAudioElement（`audio.src`）**，能够在 HTTP 响应结束前播放，消费已有缓冲后自然触发 `waiting` 和 `stalled`，FyMusic 自己显示缓冲提示，网络恢复后浏览器自然恢复 `playing` 和时间进度。

该结论**严格限定于项目授权的重复 MP3 测试帧、当前 Chromium 版本及给定服务端交付条件**；不代表第三方真实歌曲 URL、所有编码器和所有音质都验证通过。没有更改正式播放器解析和播放链路。

## 2. Git 状态与隔离

- 仓库：`lxhlw/Only-testing-online-music`。
- 开发分支：`feature/fymusic-playback-verifier`。
- 最终通过 CI 的功能 / 测试 HEAD：`1ddedf7b68d62d878d5977724316fafd846787aa`。
- 生产 `main` 本阶段前后仍为：`c9a496ab580fb54775721b93a3944800bcaefc44`。
- **未合并 main；未部署正式站；未更改源码中的音乐平台、音质选择、解析、自动重试、Media Session 或生产播放器结构。**
- 使用已有 `#audio`；没有生产 MSE、第二播放器、后台轮询或伪造 `waiting`/`currentTime`/`readyState`。
- 用户指定的真人歌曲测试目标仍是孙燕姿《开始懂了》，本阶段没有测试这首歌曲。酷狗/野花上游问题继续暂缓。

## 3. 两个真实对照实验

### A. 未知长度、只有约 3.55 秒前置 MP3 数据

文件：`functions/api/fymusic-range-selftest.js` 新增 `mode=progressive&format=mp3`，`scripts/test-fymusic-direct-progressive-browser.mjs` 新增普通 `audio.src` 真正解码测试。

- 真实 HTTP 200 分块、浏览器收到的响应不暴露 `Content-Length`，`Accept-Ranges: none`。
- 初始交付约 3.55 秒的 MP3 帧，中断约 5.5 秒，之后交付剩余帧。
- 浏览器确实发起了原生媒体请求，且在网络恢复后真实播放。
- 但是**没有在中断期间提前开始播放**：本地第一次 `playing` 5,528ms，Edge 第一次 `playing` 5,540ms。
- **没有观察到播放中途的 `waiting`**（仅启动前媒体加载等待）。

此实验说明“响应无明确长度 + 有真实 HTTP 分块”本身不保证浏览器提前开播。

### B. 约 12 秒 MP3 前置数据，之后 16 秒 HTTP 暂停（阳性）

同一服务端测试函数新增隔离的 `mode=primed&format=mp3`：

- 项目自有/授权校准 MP3 帧：每帧 209 字节，共 1,600 帧，合计 334,400 字节（约 42 秒）。
- 在初始交付 460 帧（约 12 秒媒体）后，HTTP 流暂停 16,000ms，再继续送完剩余数据。
- 服务端代码为 `primed` 响应设置了文件总长，但 **Wrangler 与 Cloudflare Edge 上浏览器实际都未读到 `Content-Length`**。不可把结果归因于客户端确定知道文件长度。服务端对浏览器 Range 头以 200 完整流响应（`Accept-Ranges: none`），并未返回伪造 206。
- `scripts/test-fymusic-primed-direct-browser.mjs` 独立读取真实字节流作为运输层证据，同时使用**页面原生唯一 `#audio.src`** 进行媒体解码并采集真实事件。
- 不使用 MSE，不执行 `dispatchEvent('waiting')`，不跳过媒体内部时钟；在页面层记录真实 `currentTime`、`buffered`、`readyState`、原生 `waiting`/`stalled`/`playing`，并把真实媒体请求的完成时间与首次 `playing` 的时间直接比较。

最终真实样本：

| 证据 | 本地 Chromium | Cloudflare Edge |
|---|---:|---:|
| HTTP 状态 | 200 | 200 |
| 总接收字节 | 334,400 | 334,400 |
| 最长真实网络间隔 | 15,999ms | 15,995ms |
| 首次 `playing`（从设置 src 起） | 32ms | 69ms |
| `playing` 发生在媒体响应完成前 | 是 | 是 |
| 播放中途 `waiting` | 是，8.12s | 是，8.12s |
| 自然 `stalled` | 是，8.12s | 是，8.12s |
| 等待时 `readyState` | 2 | 2 |
| 真实缓冲上界（等待期间） | 约 8.15s | 约 8.15s |
| FyMusic 缓冲 UI | 正确显示 | 正确显示 |
| 网络恢复后 `canplay` 与 `playing` | 是 | 是 |
| 恢复后进度继续前进 | 是 | 是 |
| 28s 观察窗最终 `currentTime` | 20.14s | 20.10s |
| 观察窗最终 `MediaError` | 0 | 0 |

两个环境真实事件顺序一致：

1. 原生 `play@0`、启动前 `waiting@0`（不计为中途等待）。
2. 真实媒体 `loadedmetadata`、`canplay`、`playing`，开始解码并推进 `currentTime`。
3. 约 8.12 秒时已收到的可播放缓冲耗尽，`readyState=2`，浏览器自然触发 `waiting`，随后 `stalled`；FyMusic 显示缓冲提示。
4. 16 秒网络暂停完成，继续传送真实 MP3 字节；浏览器自然触发 `canplay`、`playing`，进度从约 8.18 秒继续向后推进。

这是一项**真实普通 `audio.src` 直连阳性**，与第二十阶段仅通过 MSE 诱导自然等待的证明边界不同。

## 4. 工作流与真实验收

新增/修改：

- `functions/api/fymusic-range-selftest.js`：扩展隔离 MP3 分块测试的 `progressive` 与 `primed` 模式。
- `scripts/test-fymusic-direct-progressive-browser.mjs`：短前置数据、未知长度渐进式传输的反例。
- `scripts/test-fymusic-primed-direct-browser.mjs`：足量前置数据、16 秒停顿、真实原生等待与 UI 恢复的阳性回归。
- `.github/workflows/fymusic-playback-verifier.yml` 与 `.github/workflows/fymusic-ui-preview.yml`：加入两项测试的代码检查与实际 Chromium 验证。
- 原有第 1–20 阶段专项测试没有移除。

第一轮：
- `6c8b11d9f76501ec451e9fffbaa9185a7777f6c2` — 本地 [41309363084](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41309363084)、Edge [41309362923](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41309362923) 均成功，但真实提前开播**未发生**。
- `e8792bb9c72cdabeed29cb60ac35460ea7df7e13` — 新增 primed 阳性；两套 CI 均记录到正确的真实缓冲事件，但因假定客户端必然看到 `Content-Length` 的过严断言而失败。未将本轮称为 CI 成功。
- `1ddedf7b68d62d878d5977724316fafd846787aa` — 修正响应头检查；即使浏览器未收到 `Content-Length` 也不会误报，若收到则核对总大小。对真实网络暂停、解码播放、`waiting`、恢复、UI 的检查仍保持严格要求。

**最终两套完整 CI：**

- 本地 Chromium：[Run 41310152378](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41310152378)，`completed/success`。
- Edge 隔离 Preview：[Run 41310152450](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41310152450)，`completed/success`。
- 最终 Preview：https://66f3909a.only-testing-online-music.pages.dev
- 保护标识：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。
- 成功标识包括 `FYMUSIC_PHASE21_DIRECT_PROGRESSIVE_PASS`（第一组反例真实记录）、`FYMUSIC_PHASE21_PRIMED_DIRECT_PASS`（第二组阳性），以及第十九至二十阶段及其余 UI / 内存 / Media Session 等所有旧回归。

## 5. 局限、启发与下阶段

1. 当前音频为项目自有/授权 MP3 校准帧的重复内容，并不代表所有 MP3/FLAC/AAC、所有编码器、文件元数据、音质、CDN、浏览器和操作系统行为。
2. 460 帧 / 约 12 秒属于**当前测试条件**，不是推荐给正式播放器的固定预缓冲阈值；也没有证明临界前置数据量恰好为 12 秒。
3. 虽然服务端尝试设置响应的 Content-Length，浏览器在两套环境均未收到；不应笼统说“已证明已知长度响应改善开播”。真正可靠的因变量是此测试中增加初始可解码 MP3 数据量后观察到的播放事件变化。
4. 旧问题仍在：真实野花源、酷狗特殊歌曲和孙燕姿《开始懂了》没有获得新的真实播放成功证明。保持用户决定，暂不重启上游排障。
5. 还未做真实设备长时间锁屏、真实运营商弱网、多个实际音质格式的端到端证明。不能保证所有硬件 60FPS。
6. 建议第二十二阶段：围绕真实播放器**音频启动状态与缓冲事件**建立轻量化、事件驱动的质量与性能指标（仅有界采样；不添加生产持续轮询），再用更多受控 MP3 启动参数验证差异；坚持不强制 128k、尊重用户音质与原始平台，保持单音频元素。
7. 不经用户明确授权，**不得合并或发布生产 main**。本交接文档提交本身不改变运行代码，因此最终成功 CI 对应最后的功能提交，而不是后续纯文档 HEAD。
