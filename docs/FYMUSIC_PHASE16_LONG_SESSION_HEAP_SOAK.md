# FyMusic Phase 16 — Long-Session UI Heap / DOM Soak

日期：2026-11-01（Asia/Singapore）

## 目标及边界

本阶段基于 Phase 15 的封面错误保护、后台 DOM 资源限制，继续开展**可重复的浏览器内存增长趋势验证**和多轮切歌、弹层、歌单、页面恢复的短时交互压力测试。

- 正式产品名 **FyMusic**；项目 GitHub：`lxhlw/Only-testing-online-music`。
- 只修改 `feature/fymusic-playback-verifier`，仅部署隔离 Cloudflare Pages Preview；不得修改 `main` 或生产站点。
- 用户当前暂不处理 KG/酷狗上游播放异常。保持同野花 LX 音源、既有人工确认 KG→KW、用户可选音质及无强制 128k 等约束；不适配 Android 4.4.2。
- 此阶段只进行合成浏览器 UI 状态和 Chromium DevTools Memory 调试协议采样，**没有真实音乐播放请求、真机长时运行、手机系统息屏、实际内存压力、电池寿命或稳定 FPS 的证明**。
- 保持现代框架无关、节流的 UI 实现，不增加轮询、背景耗电任务或重型依赖。

## 修复 1：关闭弹层后释放潜在的脱离 DOM 的焦点对象

修改：`src/now-playing-experience.js`，commit `28e236ee581411819d97de65c316b2fad13f041a`。

进入全屏时保存 `lastFocused` 用于关闭后恢复焦点；原先关闭后该引用持续存在到下次打开弹层。如果触发全屏的原焦点元素是临时歌单/搜索按钮，而相关列表随后被重建，弹层的闭包仍可能保存已经脱离页面的节点。

现在关闭全屏时先计算可用的恢复焦点目标：已连接的旧节点，否则回退播放器封面按钮。之后立即设 `lastFocused=null`，然后恢复焦点。不会改变正常使用中关闭返回焦点的行为。

## 修复 2：减少动态效果与列表动画监听器生命周期

修改：`src/modern-ui.js`，commit `f3267ec8287f948fdb3aca165d244c952191face`。

- 根据 `matchMedia('(prefers-reduced-motion: reduce)')` 判断是否允许动画。开启减少动效时仍记录 `data-motion-seen` 但**不添加动画 CSS 类、延迟内联样式与 animationend 事件监听器**。
- 对实际使用动画的行增加 `animationend` 与 `animationcancel` 的统一 `cleanup`，在任一事件发生后移除动画类、清理内联样式并移除两个监听器，避免取消动画后留下过期监听。
- 依旧对每个 DOM mutation 批次最多安排 12 个条目的视觉动画；不限制真实歌单长度、不修改歌词/歌曲来源或用户播放控制。
- 本轮并没有声称所有后台动画都会发出 `animationcancel`，只是在可观察的取消事件发生时正确清理资源。

## 新增真正的 Chromium DevTools 采样回归

文件：`scripts/test-fymusic-long-session-memory-browser.mjs`，初始 commit `06fbded94db3d2d293957dc0406e5de4710899b2`。

- 在 Playwright Chromium 的移动尺寸环境（390×844、触控、减少动画偏好）中，运行一次预热，加 4 轮一致的重复操作。
- 共模拟 **800** 次 `lx:trackchange`、**50** 次全屏弹层打开关闭、**40** 次替换固定的 240 行列表，以及 **20** 次 `pagehide/pageshow` 浏览器页面缓存恢复。
- 通过 `HeapProfiler.collectGarbage` 显式执行 Chromium 垃圾回收，然后用 `Runtime.getHeapUsage` 读到实际 JavaScript heap 已使用字节，并通过 `Memory.getDOMCounters` 读文档数、节点数、JS 事件监听器数。
- 第一版测试尝试了不被当前 Chromium CDP 支持的 `Memory.enable` 初始化，触发测试错误；已删除该调用（commit `c84dd48935a6c990b454795513736d4ed89c2b96`），后续两个最终 CI 工作流均完成且成功。该失败属于测试调用的协议兼容，而非证明产品内存泄漏。
- 门禁固定：预热后 DOM 计数增量不超过 180 个、事件监听器增量不超过 60 个，JavaScript 堆增量不超过至少 14 MiB 的宽容阈值（适应不同 CI Runner 的 GC 波动）。阈值是避免明显无界增长的**粗粒度烟测**，不能证明绝对无泄漏。
- 每轮还验证固定 240 行、固定 2 个封面 img、默认无封面 src、无遗留减少动效动画 CSS，以及全屏弹层确实关闭并恢复焦点。
- 测试用纯合成的 source=`kw` 歌曲标识、无图像地址，**不会请求真实野花音乐音频**。

### 本地 Chromium 最终样本

CI [Run 41297219918](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41297219918)：`completed / success`。

| 时间点 | JS Heap used | DOM nodes | Event listeners |
|---|---:|---:|---:|
| 预热结束 | 2,034,752 B | 1,884 | 207 |
| 轮次 1 | 2,057,848 B | 1,884 | 207 |
| 轮次 2 | 2,071,772 B | 1,884 | 207 |
| 轮次 3 | 2,133,668 B | 1,884 | 207 |
| 轮次 4 | 2,139,104 B | 1,884 | 207 |

- JS Heap used 最高比预热基准多 **104,352 B**。
- 通过垃圾回收后的 DOM 计数增长 **0**、监听器计数增长 **0**，文档数保持 1。

### Cloudflare Edge 隔离 Preview 最终样本

CI [Run 41297219915](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41297219915)：`completed / success`。

- 实际 Edge 预览：https://b1b9df9d.only-testing-online-music.pages.dev
- 强制校验 Pages `production_branch=main`，再将功能分支上传到**非生产 Preview**。
- 预热时 JS heap **2,043,080 B**；最终 **2,148,288 B**；最高相对基准增长 **105,208 B**。
- 五次采样的 DOM nodes 恒为 **1,884**，JS event listeners 恒为 **207**，documents 恒为 1。
- `FYMUSIC_LONG_SESSION_HEAP_SOAK_PASS`；页面恢复与此前的封面故障、系统媒体按键、快速切歌、歌单分页、长歌词等浏览器回归仍然通过。
- 单次启动采样：FCP 256ms；DOMContentLoaded 321ms；约 23ms 的 First-party CPU 样本；这不是跨设备性能保障或受控 A/B 提升百分比。

## 项目状态与后续工作

生产 `main` 保持原 HEAD：`c9a496ab580fb54775721b93a3944800bcaefc44`；最终功能分支 HEAD 见实际 GitHub refs 查询。

下一阶段可以进一步：
- 在真实现代 Android/iOS 设备上测量播放一小时以上时的浏览器 JS heap、DOM、后台策略、流量、播放续航，验证真实音乐与 OS 锁屏行为。
- 在纯浏览器自动化中增加持续 UI 重新进入、弱网络模拟/媒体状态恢复及资源峰值的跟踪，不把短时 GC 采样说成硬件内存占用或零泄漏证明。
- 继续保留隔离 Preview、用户明确授权后才考虑主分支生产发布；酷狗接口排障仍按用户要求暂缓。
