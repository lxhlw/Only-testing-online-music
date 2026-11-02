# FyMusic Phase 37 — 交错 Media Session、触摸取消、键盘与高频原生触摸归属验收

**阶段日期：2026-11-02（Asia/Singapore）**  
**仓库：** https://github.com/lxhlw/Only-testing-online-music  
**开发分支：** `feature/fymusic-playback-verifier`  
**Phase36 交接 HEAD：** `09c94805843574d75a1bf77e86c936b58eefe1c8`  
**Phase37 测试与 CI 提交：** `e93fdc95dcfe690cbb5321d99b2bca99076afa8d`  
**生产 `main`：** `c9a496ab580fb54775721b93a3944800bcaefc44`，本阶段没有修改或部署生产。

## 1. 阶段结论

**Phase37 已完成，双环境完整 CI 都为 completed/success，无需额外修改播放器业务源码。**

本阶段目标是继续对 Phase36 修复的沉浸式进度条“操作归属”进行压力与恢复能力验收：多个 Media Session 跳转交错、未结束触摸被别的主体取代、原生 `touchCancel`、新键盘输入、快速连续合法触摸都必须按真实顺序决定最后播放进度，不得错误复活过期指针的预览。

新增测试 `scripts/test-fymusic-phase37-interleaved-owners-browser.mjs`，沿用 Phase36 已验证的 Chromium 390×844 移动模拟视口、CDP `Input.dispatchTouchEvent`、正常搜索与选歌、受控原始 FLAC 24-bit/96kHz 音频解析和原生媒体解码、真实 HTTP 206、真正浏览器 `touch/pointer/input/change` 事件。

测试用透传原生 `HTMLMediaElement.prototype.currentTime` getter/setter 的实例属性记录真实 seek 写入，**没有替换底层播放时钟**。现有 Media Session 的 action registration 在测试环境里由受控对象代替，因此测试的 OS 调度是**应用注册的处理器**，而不是实际电脑/手机锁屏按钮。

## 2. 新增专项场景

### 连续三次 OS seek 与旧手指的后续提交

在歌曲 B 上按下真实滑块且旧手指仍保持 pressed 时，依次调用已注册的 `seekto` handler 设置播放时间 `1.2 → 4.5 → 2.4` 秒。然后让旧手指再次移动至约 94% 并松开。

结果：`writes` 尾部始终为 `[1.2,4.5,2.4]`，触摸松开后没有新增任何写入，最后真实音频时间仍为 **2.4 秒**。三次有意的 OS seek 依原顺序生效，过期触摸无法重新取得归属。

### 原生浏览器 touchCancel

开始一个新的真实拖动，确认预览已出现。通过 CDP `Input.dispatchTouchEvent(type='touchCancel')` 让 Chromium 本身产生可信的 `pointercancel`，而非手工发送 DOM 取消事件。

结果：预览消失、写入次数不变、不修改真实音频时间，事件轨迹包含原生可信的 `pointercancel`。

### 触摸取消后键盘恢复

先将沉浸式进度条聚焦，再用 Playwright 发送实际键盘 `ArrowRight`。结果：从 **2.4 秒**跳到 **2.412 秒**，新增**恰好一次**真实媒体时间写入。证明取消旧触摸不会使后续合法键盘交互永久失效。

### 四次连续真实触摸

从同一首 B 曲顺序发起四次独立真实手指 down → move → up，不穿插歌曲切换。每次都观察预览出现与消失、真实写入次数恰好增加 1、Media Session 标题仍属 B、单个 `audio`。

真实音频依次跳到 **3.672、5.352、7.032、8.712 秒**；累计 writes 计数依次为 8、9、10、11。源解析器总调用仍恰好为 A/B 两次，选用音质 `flac24bit`，没有重复解析、音源平台切换或音频实例复制。

所有专项均继承 Phase36 的 Media Session 覆盖旧触摸、A→B 切歌覆盖旧触摸、新触摸恢复、原创 FLAC 两首歌的 HTTP 206 断言。

## 3. 真实 CI 结果

| 环境 | 工作流 URL | 结果 |
|---|---|---|
| 本地 Chromium 全套 | [41388564978](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41388564978) | **completed/success**，首次尝试，50 步 |
| Cloudflare Edge 隔离 Preview 全套 | [41388565079](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41388565079) | **completed/success**，首次尝试，48 步 |

两个运行的新增标志均为 `FYMUSIC_PHASE37_INTERLEAVED_OWNERSHIP_PASS`，包含：
```json
{
  "osSupersedesOldTouch":true,
  "newTouchAfterOS":true,
  "trackSupersedesOldTouch":true,
  "lastOSWins":true,
  "nativeCancelNoCommit":true,
  "keyboardRecoverable":true,
  "rapidNativeTouch":true,
  "realNativeTouch":true,
  "nativeAudioHttp206":true,
  "oneAudio":true,
  "newTouchOnB":true,
  "noSyntheticAudioEvents":true
}
```

完整回归继续验证 Phase36、35、34、33、32、31 的交互所有权，前后台生命周期、Media Session、响应式与可访问性、真实音频缓冲、MSE、HTTP 200/206、MP3/AAC/FLAC 原生解码、快速切歌、元数据、长期列表性能与帧一致性；没有失败步骤。

Edge 日志明确出现 `FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`；本次独立测试预览：
https://dc8c7910.only-testing-online-music.pages.dev/

## 4. 变更范围及未验证事项

本阶段新增文件：
- `scripts/test-fymusic-phase37-interleaved-owners-browser.mjs`
- 更新 `.github/workflows/fymusic-playback-verifier.yml`
- 更新 `.github/workflows/fymusic-ui-preview.yml`

**本阶段没有新改动业务源码**，因为压力测试没有复现新增缺陷；沿用 Phase36 `src/now-playing-experience.js` 的归属修复。

这是 Chromium 浏览器真实可信事件 + 受控 Media Session API 处理器，不等于实体手机屏幕手势、真实系统锁屏按钮、Safari/WebKit 与 Firefox 浏览器全部测试通过。只证明原创受控 FLAC 的 Web 播放路径；**不能声称野花/酷狗实际歌曲已修复**。用户明确暂缓酷狗专项，禁止擅自切入。音质不限制 128k，不静默降级，不修改平台与源归属，严格保持单原生 `audio`、现代 Web 流畅动画与事件驱动，继续不做 Android 4.4.2 适配。

## 5. 建议下一阶段 Phase38

验证跨浏览器操作归属差异：如可行，增加 Firefox 与 WebKit 的真实输入路径的交叉检查；优先保证 CI 环境拥有合适浏览器运行时。另可开展更长时间的同一首歌指针/键盘/OS 组合压力测试，观察失焦、恢复、进度和歌名是否稳定，且不使动画卡顿、增大内存或产生额外网络请求。**先新增测试并复现，再决定是否做生产源码修复**；遵循每阶段可核验交付、开发分支隔离和双 CI 规则。
