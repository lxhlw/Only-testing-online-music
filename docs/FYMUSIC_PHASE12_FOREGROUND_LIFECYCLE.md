# FyMusic Phase 12 — Foreground, Background & BFCache Playback UI Stability

日期：2026-11-01（Asia/Singapore）。

## 范围

按用户要求继续现代 Web 播放稳定性，不再调查酷狗上游 404/502。本阶段未修改原始 Flower、音质声明、用户确认的 KG→KW 备用播放规则、后端代理或生产部署。只允许在 `feature/fymusic-playback-verifier` 开发分支和 Cloudflare 非生产 Preview 上工作，不适配 Android 4.4.2。

## 问题与修复

### 1. 前台恢复后的 UI 状态校对

文件 `src/modern-ui.js`，功能提交 `a1b0cab54651d2183806ad5f8e2c84f154ea4e88`。

原来统一 `requestAnimationFrame` 队列能合并同帧更新；但后台停顿/从 BFCache 恢复时，音频可能已经变化、浏览器可能没有再次派发 `playing`、`pause` 或 DOM MutationObserver 事件，从而造成状态指示仍为旧值。

- `visibilitychange` 的可见态和 `pageshow` 会安排一次全局界面校对：当前导航页、状态提示、活动音源标签、歌词摘要、播放标记和迷你播放进度。
- 继续使用原有 `Set`+RAF 机制去重；没有新增循环定时器。
- `pagehide` 取消可能因 BFCache 停顿的待执行动画帧，但保留待办工作，下次前台绘制。
- 所有校对只读取既有媒体和状态，不会重新请求歌、自动 `audio.play()`、`audio.load()`、调整 `currentTime` 或换源。

### 2. 全屏播放在后台中断进度拖动

文件 `src/now-playing-experience.js`，功能提交 `7fb0a52fdf1d1a14167955340417b2279b70fb82`。

- 隐藏网页（`visibilitychange`）和进入 `pagehide` 时，取消尚未确认的进度预览、隐藏迷你播放条预览提示、取消旧歌词居中 RAF；阻止中断后产生的旧 `change` 误提交。
- 可见页面和 `pageshow` 若全屏仍打开，则根据现有 `HTMLAudioElement` 重新显示进度/播放状态，合并一帧定位当前歌词，校对可访问焦点。
- 如果全屏在隐藏之前已关闭，恢复后仍保持关闭。
- 不主动停止、恢复、加载或重新解析音乐，尊重系统和用户原有媒体状态。

## 浏览器验收

新增 `scripts/test-fymusic-foreground-lifecycle-browser.mjs`，提交 `265b10203fba907df3c6961e6d9b164bb01c7ada`；两套工作流均接入该脚本。

Chromium 使用 390×844 触控视口、减少动画偏好，模拟单个 `HTMLAudioElement` 当前 30 秒/总时长 200 秒，接着模拟尚未确认的全屏跳转、隐藏文档、`pagehide`、时间变为 70 秒、`visibilitychange` 恢复和 `pageshow.persisted=true`。捕获任何 `play`、`load`、媒体位置写入次数；测试只使用合成媒体状态，无第三方音源/实际音频解码。

验收日志为：

`FYMUSIC_FOREGROUND_LIFECYCLE_PASS`
- `backgroundSeekPreviewCancelled=true`
- `foregroundStateReconciled=true`
- `bfcacheShowRestoresUi=true`
- `miniAndImmersiveCoherent=true`
- `pauseResumeReflectsAudio=true`
- `noAutomaticPlayLoadOrSeek=true`
- `hiddenOverlayStaysClosed=true`
- `syntheticOnly=true`

其他原有 UI 回归、手机焦点、长列表压力、歌词性能、签名请求隐私测试均保留。真实浏览器的路由/音频 Fixture 测试不能当作第三方野花可用性保证。

## 实际 CI 与开发预览

- 本地 Pages Chromium [Run 41279223229](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41279223229)：completed/success，包含新生命周期测试。
- 隔离 Cloudflare Edge UI [Run 41279226226](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41279226226)：completed/success，验证 Pages 生产分支仍为 main，并在 Edge Preview 重复通过新生命周期测试。
- 最新仅测试用的 Cloudflare Preview：https://8007c299.only-testing-online-music.pages.dev
- 本轮单次 CI：First Contentful Paint 约 220ms，DOMContentLoaded 约 297ms，first-party/vendor CPU 近似采样 21ms；无严格前后 A/B 和真实设备长期样本，**不能承诺所有设备稳定 60 FPS**。

## 后续建议

下一阶段可补强浏览器页面冻结/重新激活、手机端不同尺寸的长时间歌曲播放状态一致性与 Web MediaSession 控件操作测试。真实手机在系统限制、息屏、后台省电和网络失败时能否持续播放，仍需物理设备验证，不得凭网页事件模拟判定。

生产 main 未修改，酷狗上游问题仍暂不处理。
