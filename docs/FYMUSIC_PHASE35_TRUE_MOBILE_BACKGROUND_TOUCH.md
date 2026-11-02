# FyMusic Phase 35 — 真实移动触摸后台恢复及旧手势归属修复

**交接日期：2026-11-02（Asia/Singapore）**  
**仓库：** https://github.com/lxhlw/Only-testing-online-music  
**开发分支：** `feature/fymusic-playback-verifier`  
**Phase34 交接基线：** `a23d579cb6f72c72b80599cec48fa8df9c7bbdfd`  
**Phase35 正式修复提交：** `4d3cb9206632df59a3c62ae2eb8f609cca1b5932`  
**生产 main：** `c9a496ab580fb54775721b93a3944800bcaefc44`，本阶段未修改、未合并、未部署生产。

## 一、阶段结论

**Phase35 已完成；本地 Chromium 和 Cloudflare Edge 两套完整 CI 均 completed/success。**

Phase34 已处理底部主进度条在真正标签页失焦时提前派发原生 `change` 的竞态。Phase35 进一步验证移动端沉浸式 `#detail-seek` 上的真实触摸长拖动、切换到另一浏览器标签页、返回前台、旧手指继续移动再松开的完整链路。

最初短测试「返回后直接松手」在真实浏览器环境中通过，但**不足以证明旧手势归属完整正确**。增加关键后续动作（旧手指在返回后继续 `touchMove`）后，发现并复现新的真实错误跳转，随后完成最小范围修复和双 CI 验收。

## 二、真实浏览器测试和故障证据

新增 `scripts/test-fymusic-phase35-raw-cdp-mobile-background-touch.mjs`：

- 基于 Phase34 独立 **headed Chromium + Xvfb + 原始 CDP**，用 `Emulation.setDeviceMetricsOverride` 设置 390×844 移动视口并启用 Chromium 触摸输入仿真。
- `Input.dispatchTouchEvent` 产生浏览器可信的 `pointerdown / touchstart / touchmove / input / pointerup / touchend / change`；不是直接构造这些 DOM 事件。
- 真实 Chromium `Target.createTarget` 使当前标签页进入 `document.hidden=true`，`Target.activateTarget` 恢复前台；不伪造 `visibilitychange`。
- 通过正常应用歌曲搜索、选曲、音乐 URL 回调使用**受控原创 FLAC 24-bit/96kHz 音频**；Chromium 真实解码，网络有 HTTP 206。没有伪造 `audio` 播放时钟。
- 仅用透传的 `HTMLMediaElement.prototype.currentTime` setter 记录写入次数和目标，仍调用原生 getter/setter，绝不替换媒体实现。
- 真正的系统锁屏、物理手机触摸屏、实体操作系统 Media Session 按钮**不在本次验证范围内**。

重要测试版本：

1. `68e195bafde06aa67bba14ba8b39a7c02f7f471b` 新增专项测试和双工作流路径，首轮因测试中的变量重名发生语法检查失败，没有到业务逻辑。
2. `84e224a06668fa99d4835ec9ed3e7a3a4ba2d0cb` 修正测试变量名；返回后直接松手的基本真实触摸路径通过。
3. `c6c889199d952fec002a23351dd90a4c0f137444` 在返回前台之后加入**旧手指再移动一次，随后松开**的严格断言。此时本地 Chromium 复现真实错误：
   - 标签页隐藏时 `currentTime≈0.703148` 秒，`writes:[]`。
   - 返回后旧指针发出可信的 `touchmove → input → pointerup → touchend → change`，音频被错误跳到 **11.688 秒**，`writes:[11.688]`。
   - 复现 CI：[41383008540](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41383008540)，失败点是严格的原生媒体时间写入断言，而非假造的滑块事件。

## 三、根因与最小修复

`src/now-playing-experience.js` 的 `fullSeek` 原本会在生命周期隐藏时调用 `suspendImmersive()`，设置 `ignoreCancelledSeekChange=true` 并取消进度预览。这能够拒绝**直接到来的旧 `change`**。

然而，当真实浏览器在前台恢复后继续投递旧手指的 `touchmove / input`，原有 `fullSeek input` 处理器无条件执行 `ignoreCancelledSeekChange=false`，从而使旧手势重新获得提交权限。最后一次可信的 `change` 因此把过期的预览位置写入了真实音频。

修复 `4d3cb9206632df59a3c62ae2eb8f609cca1b5932`：

- 增加小范围 `abandonedTouchGesture` 归属状态。当进行中的沉浸式触摸因 `window.blur`、`visibilitychange` 或 `pagehide` 中断时，标记该旧手势失效并清理 UI 预览。
- 在沉浸式 `input` 和 `change` 入口，对可信且已经失焦或仍属于已废弃手势的事件拒绝提交，不允许迟到的 `input` 清除失效标记。
- **只有新的真实 `pointerdown`** 才能重新开始一个新的物理触摸；明确的合法键盘操作可以重新启用键盘调整。既有程序化 UI 回归仍按原逻辑工作。
- `pointercancel` 和 Escape 取消保持旧操作无效。
- 仍使用原有 `LXPlayerControls` 和单个原生 `audio`；不新建媒体实例、不修改解析器、不放宽音质要求、不限制 128k、不引入轮询或固定等待。

## 四、修复后实际验证

| 环境 | 完整工作流 | 结果 |
|---|---|---|
| 本地 Chromium | [41383218936](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41383218936) | **completed/success，48 步** |
| Cloudflare Edge 独立 Preview | [41383218940](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41383218940) | **completed/success，46 步** |

**本地原生样本：**

- `FYMUSIC_PHASE35_TRUE_HIDDEN_TOUCH`：`seconds:0.641936`、`writes:[]`。
- `FYMUSIC_PHASE35_RETURN_AND_TOUCH_END`：`seconds:0.641936`、`writes:[]`，旧指针继续移动并完成松手，但不会重播旧跳转。
- `FYMUSIC_PHASE35_NEW_TOUCH_SEEK`：`seconds:5.352`、`writes:[5.352]`，真正的新触摸正常跳转且只写一次。

**Edge 原生样本：**

- 隐藏时 `seconds:0.679308`、`writes:[]`。
- 恢复后旧手指继续移动并松开：仍 `seconds:0.679308`、`writes:[]`。
- 新触摸 `seconds:5.352`、`writes:[5.352]`。

两套运行均出现 `FYMUSIC_PHASE35_TRUE_MOBILE_HIDDEN_TOUCH_PASS`，并保留 Phase34 原生后台鼠标、Phase33 原生鼠标/触摸、Phase32 seek 归属、Phase31 即时 seek 等完整回归。真实原始媒体请求为 206，只存在一个 audio。

Edge 独立预览： https://14880ff6.only-testing-online-music.pages.dev/  
生产分支保护证据：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。

## 五、约束及下一步

用户既定目标继续保持：**FyMusic 纯现代 Web**、流畅低开销动画、单原生播放器、事件驱动、无 Android 4.4.2 兼容投入，固定音质不静默降级，不未经授权切换平台；酷狗真实音源故障继续暂缓，真实音源仍不能用受控 FLAC 通过来推定全部修复。

**Phase36 建议：** 在真正的移动浏览器触摸手势尚未结束时引入 Media Session `seekto` 或快速 A→B 切歌，随后让原指针继续移动、松开；测试是否还存在旧手势通过新 `input` 重新取得归属的问题。此项在 Phase35 中未单独断言，不应提前宣称通过。随后再做跨浏览器和实体设备生命周期测试（若具备相应设备）。
