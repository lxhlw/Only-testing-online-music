# FyMusic v0.4.27 Remote Edge Preview Native Media / Rendering Acceptance

日期：2026-11-03（Asia/Singapore）  
发布候选版：`release/fymusic-v0.4.27-rc` = `ae562ef8ce1c22d85326bfe5a150c1cb38f2ab8b`，PR #107 **draft / unmerged**。  
生产 `main`：`c9a496ab580fb54775721b93a3944800bcaefc44`（v0.4.26）。  
锁定的非生产 Preview：https://15a05aee.only-testing-online-music.pages.dev

## 测试范围（不需要测试用 API 出现在发布站）

自动化在开发分支执行，实际访问 **v0.4.27 独立 Edge 预览站**。先对 `src/player-controls.js`、`src/app.js`、`src/now-playing-experience.js`、`src/fymusic-playback-core.js` 逐字节与固定 RC SHA 比对，并检查预览 `version.json` 等于 `0.4.27`。

真实解码测试用 Playwright 的网络拦截提供脚本**原创 8 秒 WAV tone**；播放器是预览站实际 HTMLAudioElement，使用真实浏览器解码与 `currentTime`，不是伪造媒体事件、伪造时钟，也不访问任何第三方受版权保护音乐。它验证缓冲提示、native waiting/playing、暂停恢复、Seek、真实 HTMLMediaElement 错误与安全恢复。与此同时用实际渲染引擎运行 36 次含 180 条目的 DOM 列表替换与 3 次歌词 overlay 操作。

测试入口：
- `.github/workflows/fymusic-v0427-remote-browser-acceptance.yml`
- `scripts/test-fymusic-real-media-lifecycle-browser.mjs`（新支持 Chromium/WebKit，失败时记录状态诊断）
- `scripts/test-fymusic-phase43-render-interaction.mjs`

## 实际观测

1. 第一次远程运行 https://github.com/lxhlw/Only-testing-online-music/actions/runs/41577434800：
   - RC 远程字节比对通过、Chromium 原生音频生命周期 **PASS**。
   - WebKit 等待约 5 秒仍未满足“缓冲 CSS 类+提示可见”断言，`TimeoutError`，任务失败。此处无法证明根因是 WebKit 媒体事件延迟、播放器 buffering UI 还是 CI 环境；不能把它标为通过。
2. 加入失败时媒体状态事件诊断并重跑 https://github.com/lxhlw/Only-testing-online-music/actions/runs/41577644676：
   - **completed/success**，15 个步骤通过，所有浏览器自动化检查完成。
   - Chromium 原生媒体：真实解码、等待缓冲、metadata、播放、暂停恢复、native `seeking` / `seeked`、无效数据触发真实媒体错误、仅主动选择新媒体后恢复：**PASS**。
   - WebKit 原生媒体：同上：**PASS**。无用自动恢复或重复音频；测试媒体仅为原创 fixture，完全不证明第三方音源实际可用。
   - 真实 DOM / 歌词交互：Chromium **PASS**（p95 RAF≈16.7ms、max≈16.8ms）；Firefox **PASS**（p95≈17.1ms、max≈17.1ms）；WebKit **PASS**（p95≈17ms、max≈205ms）。
   - 三个浏览器均通过 36×180 行替换、3 次 overlay 操作，1 个 audio 元素、无页面 JS 错误；数据源和 DOM 不泄漏。
3. 并行的旧 Phase8 独立全量 Preview 运行 https://github.com/lxhlw/Only-testing-online-music/actions/runs/41577389327 曾在 WebKit Phase39 OS/指针压力断言上失败。之前的 Phase40 WebKit/Firefox 原生键盘 Seek 测试通过。此为另一个可能的偶发 CI/WebKit 所有权竞争，**还没有定位、不可无条件忽略**。相关 Issue #106 持续 open。

## 发布门槛与最后一步

**不能声称“实机 Safari/iOS 不卡顿”或“孙燕姿《开始懂了》真实音源已测试通过”。**

- 待用户/可信设备实验室在真实 Safari/iOS 用以上固定 Preview 完成首屏首次交互、流畅列表、真实音频、拖动进度、切后台返回和系统媒体控制的实机操作；记录设备/系统/网络/错误/必要时无敏感日志与视频。
- 如 WebKit 205ms 长帧或首次 buffering 间歇性超时能在设备复现，保留 Issue #106 并修复回归。若无，则可以将其记为浏览器 CI 局限，但必须记录此判断依据。
- 必须获得用户**明确授权正式上线**，才准将 PR #107 合并到 main 并触发 Cloudflare 生产部署；需要保留此前生产部署 ID、能回滚的 release SHA，最后完成在线健康检查。

**剩余步骤口径：1 个发布阶段，含 2 个外部必要门槛（真实设备验收 + 明确授权后生产部署/验证）。** 不因为持续补测而虚构越来越多的“阶段”。

下一次用户说“下一步”：先复核 PR #107 / 当前 `main` / Issue #106 / 本文件；如果无新实机证据或上线授权，应清楚地请用户提供实机验收结果或明确授权，不要自动合并、部署或声称发布已完成。
