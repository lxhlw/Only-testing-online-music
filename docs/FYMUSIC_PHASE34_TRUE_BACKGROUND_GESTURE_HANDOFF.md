# FyMusic Phase 34 — 原生后台切换与未提交指针手势的归属修复

**交接日期：2026-11-02（Asia/Singapore）**  
**GitHub：** https://github.com/lxhlw/Only-testing-online-music  
**开发分支：** `feature/fymusic-playback-verifier`  
**上一阶段 HEAD：** `ffa12f4c9cba8960138edcca83f9ca7b2d5908c0`  
**Phase34 修复提交：** `c511862ae52e181470049cc0c551499c0e2c1d88`、`9d654065ded6ec3d8410aaefbd6d98cb5e02b8f7`  
**最终测试提交：** `b48a304917e26a13a2f0bc8aaf4999d4e17b7239`  
**生产 main HEAD：** `c9a496ab580fb54775721b93a3944800bcaefc44`，本阶段未修改。

## 一、Phase34 结果

**阶段完成，两个最新版本的 GitHub Actions 完整工作流均已通过。**

发现并修复 Phase33 未覆盖的真实浏览器焦点竞态：当用户正按住底部主进度条拖动时，在 Chromium 内切换标签页，浏览器在真正的页面隐藏和 `window.blur` 之前自动生成原生可信 `change`，导致未提交的旧拖动被应用到暂停中的真实音频。

修复不更改已确认的媒体 URL、音质、播放源、队列、Media Session 程序化指令，不引入轮询、新播放器或自动播放。不作 Android 4.4.2 兼容开发。

## 二、真实复现过程

测试脚本：`scripts/test-fymusic-phase34-raw-cdp-background-gesture.mjs`

基于 Phase30 原始 CDP + 独立 headed Chromium + Xvfb，**不使用 Playwright 会把标签页保持前台的页面管理器**。浏览器真正创建并激活另一标签页，使播放页产生 `document.hidden=true` 和浏览器原生 `visibilitychange`。

测试条件：通过真实歌曲列表行选曲，解析器只返回可控原创 FLAC 24-bit/96kHz 地址；`audio` 真正解码，HTTP Range 返回 206，播放进度确实推进。通过 Media Session 正常暂停后，使用 CDP 的真正鼠标按下、移动保持底部 `#player-seek` 按住；在拖动尚未松手时新开另一个原生标签页。

### 初次失败证据

- 测试首次提交 `62440feca068b7edf33b977dc7494476c40cd51f`。
- Edge 首次失败 Run [41379138803](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41379138803)。
- 发现真实隐藏后，`writes:[10.668]`、`seconds:10.668`、`paused:true`：Chrome 把拖动至约 89% 的未提交预览错误地写成真实跳转，而旧的播放位置仅约 0.62 秒。
- 新增事件顺序诊断提交 `334a2dc987c4219f4bd7af8c0c8bb640393d48b0`，Edge Run [41379293059](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41379293059) 证实：

| 原生事件 | document.hidden | document.hasFocus | performance.now 样本 |
|---|---|---|---|
| 可信 `change` | false | **false** | 1534.4ms |
| `window:blur` | false | false | 1534.4ms |
| `visibility:hidden` | true | false | 1536.7ms |

因此只在 `visibilitychange` 或 `window.blur` 时取消预览不足以阻止 **更早触发** 的原生 `change`。上述时间为一次样本的事件相对时间，不代表通用固定延迟。

## 三、正式修复

在 `src/player-controls.js`：

1. `commitSeek(event)` 入口现在首先检查：若为真实可信的浏览器事件 `event.isTrusted` 且 `!document.hasFocus()`，拒绝这次提交，并清理进度预览。**不拦截** Media Session 通过已有应用滑块链派发的合法程序化事件。
2. 新增失焦保护监听 `window.blur`、`document.visibilitychange`（仅 hidden）、`pagehide`，在浏览器没有生成 `change` 时也清理未完成的预览，防止进度冻结。
3. 真实页面失焦时将旧指针归属标记为结束，但保留“旧提交无效”的逻辑，以应对 Chromium 吞掉 `pointerup` 的情况。这样下一次合法键盘输入不会被一个永远保留的 `pointerHeld` 状态阻塞。
4. 仅沿用 existing `cancelSeek()/refresh()`，不直接改写音频时间、不强行启用 disabled 控件、不增加定时器。

具体提交：`c511862ae52e181470049cc0c551499c0e2c1d88` 处理提前 change 与生命周期清理；`9d654065ded6ec3d8410aaefbd6d98cb5e02b8f7` 修正已丢失鼠标松手时的后续键盘可操作性。

## 四、新增严格验收

真实浏览器测试要求：

- 可信原生 `pointerdown/input`，暂停媒体时确实出现尚未提交的进度预览。
- 通过真实 `Target.createTarget` 触发 `document.hidden=true`，隐藏过程中旧预览消失、媒体时间写入 **0 次**。
- 通过 `Target.activateTarget` 回到实际页面，旧鼠标释放不会写入媒体时间。
- 原有暂停状态持续保持、来源和 Media Session 标题正确、只存在一个 `audio`、媒体请求不重复。
- 通过真实 CDP `Input.dispatchKeyEvent` 输入 ArrowRight 后，原生音频可被合法跳转一次：新手势**不受过期指针影响**。
- 保留 Phase33 原生鼠标/触摸、Phase32 操作归属、Phase31 seek 即时同步及全部历史工作流。

### 完整 CI 结果（最终测试提交 b48a3049）

| 环境 | Run | 最终状态 |
|---|---|---|
| 本地 Chromium | [41379703158](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41379703158) | **completed/success**，第 2 次尝试，47 步成功 |
| Cloudflare Edge Preview | [41379703210](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41379703210) | **completed/success**，首次尝试，45 步成功 |

本地首次尝试未到测试断言：独立 Chromium 启动未产生 `DevToolsActivePort`，超时 `ENOENT`，属于 CI 测试浏览器初始化失败。重新执行失败 job 后，Phase34 专项和全部历史回归成功。必须保留首次失败事实，不把失败误写为播放器逻辑错误。

本地实测：
```json
{"hidden":true,"seconds":0.648631,"paused":true,"writes":[],"previewHidden":true}
```
回到前台并松手后：`seconds:0.648631`，`writes:[]`；新键盘指令写入 `[0.66]`，正确生效。

Edge 实测：
```json
{"hidden":true,"seconds":0.635618,"paused":true,"writes":[],"previewHidden":true}
```
回到前台并松手后：`seconds:0.635618`，`writes:[]`；新键盘指令写入 `[0.648]`，正确生效。

Edge 日志包含 `FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。

**独立预览：** https://bf04f905.only-testing-online-music.pages.dev

## 五、测试范围与下阶段

- 这是 Chromium + Xvfb 的真实浏览器目标切换，以及原生鼠标事件 / 真实 FLAC 解码；不是物理 Windows 窗口失焦、实体手机锁屏或 Android/iOS 的音频焦点试验。
- Media Session OS handler 在测试中使用受控替代 API；不代表真实操作系统通知中心的测试。
- 受控原创 FLAC 播放成功 **不代表所有第三方歌曲、酷狗或野花音源全部修复**。用户要求暂缓酷狗专项。
- Phase35 建议验证更复杂的移动触屏在真实标签页 hidden、浏览器页面生命周期恢复时的残留触摸操作，检查焦点变化、连续快速拖动和高频歌曲切换的组合，同时注意不要因重度测试引入生产轮询和动画卡顿。
