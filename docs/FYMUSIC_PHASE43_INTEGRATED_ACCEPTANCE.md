# FyMusic Phase43 — 跨引擎综合性能、资源及原生播放验收

日期：2026-11-03（Asia/Singapore）
分支：`feature/fymusic-playback-verifier`
生产 `main`：`c9a496ab580fb54775721b93a3944800bcaefc44`（未修改、未部署）
Phase42：已完成；Issue #105 在 24-session WebKit 和本地/Edge 全 CI 成功后关闭。

## 本阶段目标及交付

- 新增 `scripts/test-fymusic-phase43-render-interaction.mjs`：Chromium、Firefox、WebKit 真正引擎、正常动画偏好、36 轮各 180 行的列表替换及曲目 UI 更新、真实 RAF 间隔取样、3 轮打开关闭播放详情、错误收集。无第二音频实例、无第三方歌曲请求。
- 新增 `.github/workflows/fymusic-phase43-integrated-acceptance.yml`：隔离本地 Cloudflare Pages 原创媒体，三引擎独立交互、真实 MP3/Media Session/键盘 seek 回归；Chromium 多轮内存、封面失败、页面更新、列表、源/音质归属及弱网恢复回归。
- 新脚本**只采集**帧间隔，不能把 CI RAF 间隔换算为用户设备 60/120Hz FPS 保证。生产端不增加 sleep、轮询、自动回退音质或播放器实例。

新增代码：
- `3b633d9219dd4128fb9d6656e91b0fed0de950b9`：Phase43 UI/RAF 真实浏览器指标采集。
- `3513552a41133b17bafe2c9d7715168141bd15f2`：跨引擎验收工作流。
- `eabfccd413e54a67d31045b6d8938ee1d3ecebb8`：增加 WebKit 12 次独立专项，以调查首轮超长帧。

## 第一轮 GitHub Actions 验收

Run: https://github.com/lxhlw/Only-testing-online-music/actions/runs/41569473983

**completed/success，4/4 jobs 均通过**：Chromium 真实 UI 和媒体、Firefox、WebKit、Chromium 资源/质量套件。

- Chromium 动画帧间隔 p95：16.7ms（3/3 次）；Firefox p95：17.0–17.1ms（3/3 次）。
- WebKit p95：17/29/30ms（3/3 次）。一轮最大帧间隔 332ms，另一轮 132ms，第三轮 37ms。**这是实际 CI 观测值，不能将 4/4 成功概括为已经证明真实设备完全无卡顿。**
- 三个浏览器每次均完成 36 轮 × 180 行替换，共 6480 个新建行、最终保留 180 行，封面节点数量 2，audio 元素 1，详情弹窗操作 3 轮，无页面异常。
- 原生真实 MP3/HTTP Range、系统跳转、键盘、换曲归属在 Chromium、Firefox、WebKit 均 2/2 独立通过。
- Chromium 长会话 3 次，每次模拟 800 次切换、50 次详情开关、40 次列表替换、20 次页面恢复；GC 后累计额外 DOM 节点 0、监听器 0，JS 堆增量峰值约 110KB（隔离浏览器测试；不属于真实设备长时内存实测）。
- Chromium 源选择、FLAC24 和 MP3 原创素材、自动降级保护、系统元数据以及弱网回归 2 次通过；未验证第三方音乐供给、真实用户设备锁屏。
- Phase42 独立 Cloudflare Edge Preview 完整回归 51/51 成功： https://github.com/lxhlw/Only-testing-online-music/actions/runs/41560895324 。Phase43 没有修改生产代码；Phase43 新压力测试仅运行在隔离本地 Pages，不要声称已经在 Edge 重新运行。

## 第二轮增强 WebKit 诊断（最终完成）

Run: https://github.com/lxhlw/Only-testing-online-music/actions/runs/41569768603

**completed/success；4/4 jobs 全部通过。** WebKit 12/12 组真正内核的 UI RAF/交互压力测试通过、2/2 原创 MP3/OS/键盘回归通过。Chromium、Firefox、Chromium 资源/质量分组也均成功。

12 组 WebKit RAF 数据（单位 ms）：

- p50：12/12 组均为 16ms。
- p95：各组为 17、17、17、29、28、17、17、17、17、17、17、18ms。
- 单组最大值：344、148、49、43、35、46、60、49、65、51、52、51ms。
- 首两组出现 344ms、148ms 超长帧，其余 10 组单次最大值均不超过 65ms；全部 12 组正常完成最终 UI 归属、3 次弹窗交互、180 个最终列表节点、单 HTMLAudioElement/双封面节点、无页面异常。
- **不可忽略最初两组的超长帧。** 观察到重复会话的冷启动抖动趋势，但这些 CI 测量无法证明根因就是浏览器首次进程初始化，也不能说明普通硬件用户一定没有类似卡顿。Phase44 应将首屏动画/首交互真实设备性能采样列为发布复核项目。

结论：Phase43 **隔离浏览器综合功能及资源验收通过**；WebKit 初次会话的长帧是一项**未完全消除的性能风险**，不能把本阶段成功说成“真实设备全场景 60/120 FPS 无卡顿保证”。生产代码无新改动，所有测试未合并 main。

## 交接及发布边界

Phase43 在增强 CI 最终确认后可结束，下一阶段 Phase44：核对开发与正式 main 差异、审计路由/隐私/错误回退、验证性能风险和设备边界、归档验收证据、给出可回滚发布建议。

预计总规划至 Phase44；除当前 Phase43 外，**后续还有 Phase44 一个阶段**。未授权前不得合并至 main 或执行生产 Cloudflare Pages 部署；此前暂缓的酷狗专项不自动复工。
