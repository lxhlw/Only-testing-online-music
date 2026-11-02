# FyMusic Phase41 — 前后台状态恢复诊断、测试误报根因及 WebKit 遗留竞态

**日期：2026-11-03（Asia/Singapore）**
**仓库：** https://github.com/lxhlw/Only-testing-online-music  
**开发分支：** `feature/fymusic-playback-verifier`  
**生产 main 基线：** `c9a496ab580fb54775721b93a3944800bcaefc44`，本阶段未合并、未部署。  
**上一阶段播放器源码：** `7191d1d47ed2cfdd46eddc84835084cb9e50cc8f`，Phase41 没有更改播放器业务源码。

## 一、Phase41 核心结论

**本阶段原定的前后台状态恢复偶发失败已经定位为测试断言误报，而非播放器恢复失败。**

Phase40 Cloudflare Edge Run [41483024487](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41483024487) 首次运行曾在旧测试断言 `foreground should restore status class` 失败，第二次运行整套成功。原因当时未知。

Phase41 为 `scripts/test-fymusic-foreground-lifecycle-browser.mjs` 增加有界的 90 条状态轨迹：记录真实 #status 文本、is-resolving / is-playing 类、页面 hidden/focus、原生媒体时间、status/root DOM mutations 和 visibilitychange/pagehide/pageshow/timeupdate 事件。没有篡改媒体时间，也没有增加生产轮询。

在 Edge [41490220492](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41490220492) 的 **10 次独立浏览器专项的第 7 次**真实抓到误报：

1. 后台测试写入 `正在准备 synthetic background status`。
2. 页面恢复后，`is-resolving=true`、`is-playing=true` 且 footer 正确同步。
3. 大约 10 毫秒后，真实项目中的野花音源初始化回调合法地将状态改成 `音源已执行并发送 inited：野花🌷`。
4. `src/modern-ui.js` 监听到 status mutation，正确把 `is-resolving` 改为 false，footer 更新为音源已就绪。
5. 旧测试不检查当前状态文本，始终强制断言 `is-resolving===true`，因此失败。

这段证据明确证明 UI 的异步处理在该样本中是**正确的**，失误属于测试断言。

## 二、最小测试修复（不修改播放器源码）

正式测试修订提交：`bfffccedbb9a06a942765dada44fda72053a7d0d`。

不再强制要求前后台恢复后的 status 永远保留测试人工写入的“正在准备”。改为在一次原子页面快照中：

- 根据当前实际 #status 内容，按照现代 UI 既有的“正在|连接|请求|解析|等待|下载|准备”规则计算预期 `is-resolving`，保留“已开始播放|搜索完成|已经播放”的排除规则；
- 严格断言根 CSS 状态等于**当前真实状态文本**的含义；
- 严格断言 footer 等于**当前真实 #status 文本**（同现有 44 字限制）；
- 保留 `is-playing=true`、音源同步、歌词、沉浸式进度、媒体时间等全部断言；
- 原有不得自动调用 `audio.play`、`audio.load`、`audio.currentTime` setter 的 0 次限制仍然严格保留；
- 不增添固定 sleep、事件轮询或放宽准确度容差。

## 三、验证记录

1. 本地首次加入 10 次循环的 Run [41487239418](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41487239418)：原 10 次独立生命周期测试步骤全部通过；随后整个工作流的 12 分钟总时限触发取消（到 45 个成功步骤），不是应用测试失败。为适应本轮重复压力，已将本地 CI timeout 调整为 22 分钟、Edge 调整为 26 分钟。需保留这个 CI 环境耗时事实。
2. Edge 加诊断的单次旧测试 Run [41487199681](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41487199681)：完整工作流 `completed/success`，现场状态为 synthetic 文本、is-resolving true。
3. Edge [41490220492](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41490220492)：在新增严格诊断后捕获真实的第 7 次合法异步源状态覆盖，此次运行因此失败，成为根因证据。
4. 修正测试后，单独隔离 Edge Preview 20 次真 Chromium 页面生命周期验证 [41491029170](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41491029170) **completed/success**。日志有 `FYMUSIC_PHASE41_FOREGROUND_CODE_PARITY_PASS` 和 `FYMUSIC_PHASE41_EDGE_FOREGROUND_20_PASS count=20`。其中 19 次快照仍是正在准备，1 次已经切换到“音源已执行并发送 inited”；两种状态均通过对应严格断言。
5. 全量回归当前修正版 Run：本地 [41490966125](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41490966125)、Edge [41490966134](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41490966134)。它们的最终 `completed/success` 必须在 Actions 完成后再次确认；本文件起草时仍在执行，不得提前宣称整套双 CI 成功。

独立诊断 Preview 为：
https://66080e8c.only-testing-online-music.pages.dev

这是一条经源码文件逐字 `cmp` 校验的非生产 Cloudflare Edge 预览，不是生产 URL。此前播放器代码和此 Preview 一致；Phase41 只调整测试和 CI 文件。

## 四、重要的新发现：WebKit 真实媒体 seek 位置回退，留至 Phase42

需要严格区分：这不是上述生命周期测试误报，也没有在 Phase41 修复。

- 完整 Edge 回归 [41489563288](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41489563288) 发现 WebKit 的第七组快速 OS seek + keyboard 操作发生偏移。
- 独立 8 次重复 [41490297014](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41490297014) 均通过，说明事件低频。
- 增强诊断的 24 轮 WebKit 测试 [41490752709](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41490752709) 在第 **18** 次重新复现，记录 `FYMUSIC_PHASE41_KEYBOARD_RACE_webkit`。

准确关键数据：

1. 前一轮音频在 ~3.094204 秒。
2. 本轮 OS `seekto(1.85)` 调用原生 setter 后，读回约 1.862531 秒；base slider 显示 62/1000。
3. 旧鼠标提交被阻止，没有新的应用 currentTime setter 写入。
4. 在首次 ArrowRight 之前，**WebKit 原生 currentTime 自行回到上一轮约 3.094204 秒**，即使自 OS 指令以来没有额外应用 setter 写入；range 值再次成为 103。
5. 新 ArrowRight 实际跳至约 3.124245 秒，而最新 OS 目标加一步应是约 1.892571 秒。

这指向真正的媒体引擎异步 seek 归属竞态：单纯以 native `currentTime` 实时读数刷新 UI，在未完成的 seek 期间可能读取旧位置。Phase42 应测试保留最新显式 OS seek 目标及其 generation，直到有效用户操作或对应媒体 seek 确认，**不应简单固定延迟、循环重试或降低断言**。

GitHub 正式跟踪 Issue：
https://github.com/lxhlw/Only-testing-online-music/issues/105

## 五、阶段后续

- **Phase41 原始问题的根因与 QA 修复已完成**，但全量双 CI 的最新结果需再次确认，不能把未完成的 runs 写为 success。
- 下一阶段优先处理 Issue #105 的 WebKit 真实 native seek 回退，先增加严格回归，之后最小源码修复，再完成本地 + Edge 全量 CI。
- 保持单原生 audio、音质选择不自动降级、现代 Web 流畅 UI、不增加固定轮询、不适配 Android 4.4.2、不擅自重启酷狗专项。
- 不修改生产 main，除非用户明确授权。
