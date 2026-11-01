# FyMusic Phase 17 — Weak-Network UI State & Foreground Recovery

日期：2026-11-01（Asia/Singapore）。

## 目标及严格约束

Phase 16 已建立反复切歌、列表切换、弹层开关和页面缓存恢复的 Chromium CDP 内存采样基准。本阶段按用户「下一步」补强弱网络时的**界面状态一致性**，避免误操作音频流，沿用现有网络解析和媒体错误处理。

- 项目名保持 FyMusic，现代高性能 Web 方向，不适配 Android 4.4.2。
- 只在 `feature/fymusic-playback-verifier` 开发分支修改。Cloudflare Pages 仅部署隔离 Preview。生产 `main` 严禁自动部署。
- 用户明确要求暂不调查 KG/酷狗的 Flower 上游解析问题；不修改签名传输、服务器代理、不暗中切换 KG→KW、不限制 128k，也不将合成测试当作孙燕姿《开始懂了》的真实播放证明。
- 在本阶段不新增任何自动重新解析、`audio.play()`、`audio.load()`、`currentTime` 写入、后台定时器或轮询机制。原 `src/app.js` 中的音频连接超时、媒体确认和原有同平台解析回退策略保持原样。

## 改动内容

1. `index.html`，提交 `8c54c5333e5397f1dd0c8d37b3ca9872d32b1f9a`：迷你播放器的歌曲信息区域新增 `#player-network-hint`，使用 `role=status`、`aria-live=polite`、`aria-atomic=true`，默认隐藏。

2. `modern.css`，提交 `c9d2d264cc7b1b7d9701ebe1d2bacd7a9ed66d65`：网络提示采用 11px 轻量内联文本和单行截断，避免布局跳动；浏览器报告离线时改变提示文字颜色，不增加持续动画和额外大图。

3. `src/modern-ui.js`，提交 `5fc383b5e014f90aa90ecc56bc7eb4fddc4be4f6`：

- 使用 `waiting` / `stalled` 事件标记可能的缓冲中状态；仅当前 `audio.currentSrc` 非空、媒体尚未暂停/结束/报错时显示。
- 仅在 `playing`、`canplay`、`canplaythrough`、`seeked` 等明确恢复事件后清除缓冲标记，或在 `timeupdate` 且 `readyState>=3` 后清除；普通 `timeupdate` 不会错误地解除缓冲。
- `pause`、`ended`、`error`、`emptied`、`abort` 清除缓冲标记，避免将暂停和空媒体误显示为网络故障。
- 浏览器报告 `navigator.onLine===false` 时显示「浏览器报告离线 · 等待网络恢复」。其值只是浏览器报告的联网状态，不能证明第三方音源或 CDNs 一定可用。
- 为缓冲状态添加 `html.is-buffering`，离线状态添加 `html.is-offline`，分别用一个轻量文字提示而不是强制改变系统播放状态。
- `visibilitychange` 返回前台和 `pageshow` 页面缓存恢复后，利用现有去重的 requestAnimationFrame work Set 校对提示及媒体状态；不重新请求旧媒体。
- 当 `currentSrc` 更换时重置旧曲目的 `networkBuffering`，避免此前歌曲的缓冲提示覆盖新的曲目。
- 不修改 `#bottom-play-status` 或项目原有音频请求/错误处理链路中的权威状态消息。无需额外 Media Session 处理逻辑。

## 新浏览器回归

文件：`scripts/test-fymusic-weak-network-recovery-browser.mjs`，提交 `8304c8850862893b9ea652256394db8c071767d1`。

该测试在真实 Chromium 页面中注入**合成 HTMLAudioElement 状态**、可控 `navigator.onLine`、`document.hidden`，调用原页面的事件监听器，并且记录 `play`、`load`、`pause`、`currentTime` 和 `fetch` 的额外调用次数。

覆盖场景：
- `waiting` 后显示缓冲信息；readyState 不足时 `timeupdate` 不误解除缓冲；
- `offline` 优先呈现浏览器离线状态；
- 隐藏页面、模拟 `pagehide`，在后台替换 350 行合成歌单并更新音频播放位置，随后 `online`、`visibilitychange` 和 `pageshow.persisted=true` 恢复页面；不自动操作媒体流；
- `canplay` 和 `playing` 恢复时清除不适用的错误提示；
- 切换 URL 后不遗留旧源缓冲状态；
- 暂停与清空音频源时不提示错误；
- 共 300 次交替网络/媒体事件及多次页面缓存恢复后，页面 UI 无异常、无额外自动播放/加载/跳转/网络请求；
- 通过 Chromium CDP 垃圾回收后 `Runtime.getHeapUsage` / `Memory.getDOMCounters` 查看同一次压力循环前后的 JavaScript heap、DOM 和监听器计数变化。

浏览器回归使用 `example.invalid` 合成音频源地址；既没有测试真实野花音乐 URL，也没有对 Web 通断网物理出口、CDN 故障重试或安卓/苹果锁屏进行实测。

## 最终 CI 验证

**本地 Pages Chromium**：[Run 41299486934](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41299486934)，completed / success。

`FYMUSIC_WEAK_NETWORK_RECOVERY_PASS`：
- `bufferingVisibleDuringWaiting=true`
- `offlineOverridesBuffering=true`
- `hiddenRestoreReconciles=true`
- `normalCanplayClears=true`
- `oldSourceBufferingDiscarded=true`
- `pausedOrUnloadedHasNoAlert=true`
- `burstEvents=300`
- `noAutoRequestsOrSeek=true`
- `appStatusUnchanged=true`
- `postGcHeapDeltaBytes=62452`
- `postGcDomDelta=1`
- `postGcListenerDelta=0`
- `syntheticOnly=true`

**Cloudflare Edge 隔离 Preview**：[Run 41299491389](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41299491389)，completed / success。

- 部署前验证 `FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`；没有将测试代码推到生产站。
- 隔离 Preview：https://901f42b9.only-testing-online-music.pages.dev
- `FYMUSIC_WEAK_NETWORK_RECOVERY_PASS`：300 次事件、无自动媒体操作、堆增量 67,628 B、DOM 增量 1、监听器增量 0。
- Phase 16 长期 UI 压力回归在此 Preview 上再次成功：模拟 800 次切歌、50 次弹层、40 次列表替换、20 次页面恢复；两处封面节点保持不变。
- 本次隔离 Preview 单次性能快照：FCP 264ms、DOMContentLoaded 325ms、approx 31ms first-party CPU 采样。它不是受控 A/B、持续 FPS 或设备耗电结果。

## 范围限定与下一阶段方向

本阶段只是**弱网络和浏览器状态的呈现与校对**，不改变用户选择的真实音频来源，不会尝试自动重新启动暂停的媒体流。浏览器 onLine 值不等于 CDN 可访问，因此在预览中看到离线提示，也不能断言原平台故障原因。

若继续推进下一阶段，可进一步检查真实媒体事件顺序与错误/超时竞态（包括 `waiting`→`playing`→`error` 等），并利用授权的本地媒体 fixture 在 Chromium 中走真实 `HTMLAudioElement` 生命周期；用户未授权前仍然不得发布到生产 `main`。
