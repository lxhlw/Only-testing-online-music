# FyMusic Phase45 — 正式版 vs 精选候选版 WebKit 冷启动成对对照

日期：2026-11-03（Asia/Singapore）
分支：`feature/fymusic-playback-verifier`
正式生产 main SHA：`c9a496ab580fb54775721b93a3944800bcaefc44`
对照代码 SHA：`c847d93b5cf413abcfa2a6807b7052568fb3b7fe`
生产状态：**未合并、未触发生产部署**。

## 1. 为什么做本次对照

Phase43/44 在真实 Playwright WebKit headless CI 中曾见 344ms、3509ms 等孤立长帧。但这些数据没有正式版对照，不能据此把长帧归因为 FyMusic 新代码。为降低“先启动的浏览器总是更慢”这一混杂因素，本次采用平衡交错的 AB 对照。

## 2. 可重跑的技术方案

代码：
- `scripts/diagnostics/fymusic-phase45-webkit-ab-compare.mjs`
- `.github/workflows/fymusic-phase45-webkit-ab.yml`

工作流从经审计的 main SHA 构建原始正式版，另在**独立本地目录**从同一 SHA 出发叠加 Phase44 已审核的 17 个运行时文件；后者排除 QA 专用 API、测试工作流、生成测试音频素材。

两个隔离的 Pages 实例使用 localhost:8787 与 localhost:8788，不涉及 Cloudflare 生产部署。Wrangler 使用**不同 inspector port** 9337 与 9338，避免多实例端口争用。

8 个独立 WebKit 浏览器进程，每个会话分别加载两套站点，AB/BA 交替；每套站点执行 36 次完整列表 DOM 替换（每轮 180 条）+ `lx:trackchange` UI 事件。每轮采集实际 requestAnimationFrame 间隔、同步 JS DOM 工作时间、剩余 RAF 等待时间，并附 12 个空闲帧。真实浏览器而非只切换 UA；不访问第三方歌曲，不用伪造音频时钟或冒充真实 Safari 设备。

第一次工作流 https://github.com/lxhlw/Only-testing-online-music/actions/runs/41574037475 **失败于测试基础设施**：同时启动的两个 Wrangler 在调试监听端口争用，正式版端口无法绑定。加入显式独立 inspector ports 后重测成功；这次失败不能算 FyMusic 性能回归。

## 3. 最终验证

成功 CI：https://github.com/lxhlw/Only-testing-online-music/actions/runs/41574266790

- 工作流 completed/success，12 个 success 步骤、1 个诊断步骤按预期 skipped。
- 正式版 v0.4.26 vs FyMusic 精选候选版，各 8 次独立会话，初次加载的先后顺序各 4 次。
- 正式版：最长单帧间隔 **254ms**；8 次会话内有 1 次 >=100ms 的长帧；最长同步 JS 工作 **2ms**，最长剩余 RAF 等待 **253ms**。每轮 p95：[17,18,17,20,17,17,17,24]ms。
- 精选候选版：最长单帧间隔 **99ms**；本次 8 次会话无 >=100ms 的长帧；最长同步 JS 工作 **3ms**，最长剩余 RAF 等待 **98ms**。每轮 p95：[22,17,25,31,25,24,22,17]ms。
- 两个版本完整列表替换 36 次/会话，均保留 180 行、1 个 audio 元素，无 pageerror；空闲帧最大值正式版 19ms、候选版 18ms。
- 完整 JSON 与 SHA256 候选版清单保存在上述 Actions 的 `fymusic-phase45-paired-webkit-evidence` artifact（保留 14 天）。

**证据界限**：本轮没有发现“候选版比正式版更易出现极端长帧”的证据；两个版本均可出现首次 RAF 额外等待。但候选版部分 p95 样本较高，且此前另一次 CI 曾在候选版记录 3509ms 极值。不能从 8 个配对会话得出候选版长期更快或绝对不卡顿的结论。headless Linux WebKit 不等于真机 Safari/iOS，也没有针对实际 CPU/GPU 的完整性能归因。

## 4. 后续发布计划和剩余数量

原定 44 个开发审计阶段已完成，本次是发布门槛的辅助对照工作。**下一步还剩两个主要流程阶段**：

1. **精选发布候选版和 PR**：在 `main` 新建独立发布分支，只携带允许的运行时文件；把现有 `v0.4.26` 的新功能发布为新版本（提议 `v0.4.27`，不是已发布版本），统一 HTML/CSS/JS 缓存键，运行完整 PR 验证，并给出复核结论；**不合并、不部署**。
2. **经授权的正式发布**：核查真实 Safari/iOS 等实际设备首交互性能，得到用户明确批准后才合并、部署，检查 Cloudflare Pages 健康与播放，保留回滚路径。无批准则继续保留现有生产 main。

Issue https://github.com/lxhlw/Only-testing-online-music/issues/106 应持续开放到实机验收结束；现有不确定性不应静默关闭。

## 5. 新对话口令

用户说“下一步”：先查最新的 main SHA、开发分支 SHA 和 Issue #106，再在**不部署生产**的条件下准备精选 release 分支/PR，使用 Phase44 白名单 17 个运行时文件和独立版本变更。必须先检查 release PR 是否无测试 API、无 CI 工具泄漏；完成验证后给出状态。若用户尚未授权上线，停在可审查的 PR 和 Preview，不能自动合并。
