# FyMusic Phase36 — Media Session 跳转、切歌与未完成触摸手势归属

**日期：2026-11-02（Asia/Singapore）**  
**仓库：** https://github.com/lxhlw/Only-testing-online-music  
**开发分支：** `feature/fymusic-playback-verifier`  
**Phase35 基线：** `1c80326beedbd7a25ffc26772d98cac2ba8b9364`  
**代码修复：** `ade690980149226dce8a23228e658f2024807d7a`  
**最终验收测试提交：** `a73ffe858322b0027edf52d0d27d739720baa910`  
**生产 `main`：** `c9a496ab580fb54775721b93a3944800bcaefc44`，未改动、未合并、未部署。

## 1. 结论

**Phase36 已完成并通过双完整 CI。** 新增原生触摸专项，在真实 Chromium 解码的原创 FLAC 24-bit/96kHz 与 HTTP 206 网络条件下，检测沉浸式进度条的手指还按住滑块时：

1. 媒体系统通过已有 Media Session `seekto` 将当前音频跳至 3 秒；
2. 系统跳转后，旧手指再移动、松开；
3. 新手指重新开始合法 seek；
4. 旧手指在歌曲 A 上按住时，用户通过真实搜索结果行切换到歌曲 B；
5. B 曲确认开始播放后被正式 Media Session pause，旧手指再移动、松开；
6. B 曲新手指再次合法 seek。

检测真实浏览器 `touchstart/touchmove/touchend/pointerdown/pointerup/input/change` 及实际 `audio.currentTime` **原生写入**，不仅检查滑块事件次数。两首曲都保持原始请求的 `flac24bit` 音质，都通过原创受控 FLAC 的真实 HTTP 206 响应，只有一个原生 audio。

## 2. 故障复现与根因

新建测试：`scripts/test-fymusic-phase36-native-touch-os-track-browser.mjs`；基于 Phase33 的应用内搜索、选曲、真实原生音频测试。设备配置采用 Playwright Chromium mobile 390×844 和 CDP `Input.dispatchTouchEvent`。这产生真实浏览器可信触摸事件，但**不是实体手机触摸屏或系统锁屏验证**。

首次测试提交：`27bce3acd96aabab83f1a01eaac11da38834db65`。在尚未修复的代码上：

- OS 正确写入 `audio.currentTime=3`，`writes:[3]`。
- 同一根手指随后 `touchmove → input → pointerup → touchend → change`，旧的 `input` 重置 `ignoreCancelledSeekChange`，音频被错误地再次写到 11.688 秒：`writes:[3,11.688]`。
- 本地失败 Run [41386428921](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41386428921)，Edge 失败 Run [41386428936](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41386428936)。
- 因测试在首个 OS 竞态就严格失败，首次运行**没有**得出切歌冲突是否会触发的单独结果；不能把它写成已经同时复现两项故障。

根因：Phase35 的 `src/now-playing-experience.js` 已建立 `abandonedTouchGesture`，但它只在失焦、隐藏、触摸取消等路径置为失效。Phase32 的 `invalidateSeekPreview()` 接收 OS seek、歌曲切换，只标记 `ignoreCancelledSeekChange` 并取消旧预览，**没有同步标记正在继续的触摸已经被其他主体取代**。旧触摸再次发送原生 `input` 时，`ignoreCancelledSeekChange=false`，于是错误提交。

## 3. 最小修复

修复提交 [ade69098](https://github.com/lxhlw/Only-testing-online-music/commit/ade690980149226dce8a23228e658f2024807d7a)：

```js
function invalidateSeekPreview(){
  if(!seekPreview)return;
  // OS seek and track replacement also invalidate an already held finger.
  // Chrome can continue emitting trusted touchmove/input after this event;
  // do not let that old input rearm a commit on the new media owner.
  abandonedTouchGesture=true;
  ignoreCancelledSeekChange=true;
  cancelSeekPreview();
}
```

同一个 `invalidateSeekPreview()` 由 `fymusic:external-seek` 与歌曲 `setTrack()` 调用。利用 Phase35 已有的 `rejectStaleNativeSeek(event)` 检查：当前滑块的后续可信原生 `input/change` 被拒绝，直到真正新的 `pointerdown` 或允许的键盘手势开始。OS seek 经原有程序化路径提交，不被阻断。

没有重新配置播放器架构、音频源、质量、时间器、后台轮询、额外 audio、旧版 Android 适配或页面动画。

## 4. 验收过程的测试严谨性

修复后复测时，OS 冲突已通过，但最初测试在 B 曲上开启新手势的断言失败。诊断提交 `6b5228a233a4e74fa0c4d5815ce85658877f17fc` 记录完整 slider/overlay/触摸状态。

发现测试在 A 曲旧手指仍按住时，用 Playwright `.tap()` 点击 B 曲暂停键，等于在受控 CDP 手指之外又注入一个原生触摸，干扰了旧手势生命周期，不能用于证明单指归属故障。

测试修正提交 `a73ffe858322b0027edf52d0d27d739720baa910` 改为调用现有 Media Session `pause` handler 暂停 B，不引入第二根手指。保留真正的歌曲搜索结果切换、正式音频解码、旧手指移动、松开、下一次新触摸，并继续断言 0 次意外写入。**这个改变只修改测试手势干扰，不修改产品代码。**

## 5. 最终真实证据（最新测试提交 a73ffe85）

| 验证 | GitHub Actions Run | 最终状态 |
|---|---|---|
| 本地 Chromium 完整回归 | [41386919225](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41386919225) | completed / success，49 个步骤，首次运行 |
| Cloudflare Edge 独立 Preview 完整回归 | [41386919121](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41386919121) | completed / success，47 个步骤，首次运行 |

两边的具体轨迹一致：

- `FYMUSIC_PHASE36_OS_TOUCH_CONTINUATION`：`osWrite.time=3`，`writes:[3]`；旧手指继续动作后 `afterOS.time=3`，**仍 `writes:[3]`**。
- `FYMUSIC_PHASE36_FRESH_TOUCH_AFTER_OS`：合法新触摸跳到 5.352 秒，`writes:[3,5.352]`。
- `FYMUSIC_PHASE36_TRACK_TOUCH_CONTINUATION`：B 曲当前时间约 0.56 秒，旧 A 手指继续移动、松开，**writes 不增加**，当前歌曲名和 Media Session 标题都是 `Phase32 Original B`，audio 元素只有 1 个。
- `FYMUSIC_PHASE36_NEW_TOUCH_ON_B`：B 曲新触摸正常跳到 5.868 秒，`writes:[3,5.352,5.868]`。
- 两套运行均记录 `FYMUSIC_PHASE36_TOUCH_OS_TRACK_PASS`，原有 Phase35、34、33、32、31 等测试与全套音频网络、解码、元数据、响应式布局回归保持成功。

Edge 隔离预览：[https://c60db8f9.only-testing-online-music.pages.dev](https://c60db8f9.only-testing-online-music.pages.dev)。
Edge 部署保护日志：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。

## 6. 下一步建议 Phase37

继续对 Phase36 未覆盖的“多次交错 Media Session 命令、同一首歌连续两次快速拖动/触摸取消、跨播放器的键盘与指针操作”做真正的浏览器压力测试；重点是所有主体的最后指令归属、正常手势始终能重新工作、不导致额外媒体请求和卡顿。保持事件驱动、现代流畅 Web、单原生播放器。**真实实体手机锁屏/操作系统按钮、第三方野花实际歌曲能否播放仍未被本次受控验证证实。** 用户此前明确暂缓酷狗专项，不擅自切回。
