# FyMusic Phase44 — 最终发布审计、候选版隔离与回滚交接

日期：2026-11-03（Asia/Singapore）
审计目标：尽可能完成正式发布准备，但**严禁未经用户明确授权修改/合并 main 或部署生产 Cloudflare Pages**。

## 1. 基线与决策

- 生产 `main`：`c9a496ab580fb54775721b93a3944800bcaefc44`，版本 `v0.4.26`，此前发布不在 Phase44 中修改。
- 完整功能开发分支：`feature/fymusic-playback-verifier`。
- 首次 Phase44 比较：分支比生产 `main` **领先 302 个提交，差异 139 个文件**，含测试 workflow、浏览器测试、诊断文档、API selftest。不能整支直接合并。
- `.github/workflows/verify-and-deploy.yml` 在 `main` push 时会执行生产部署；手工 workflow_dispatch 也能部署，因此禁止在未经授权时向 main 推送、合并或者触发该部署工作流。
- 当前决策：**隔离候选版的代码/安全/浏览器回归通过；正式生产发布维持 HOLD**。原因包括真实设备 WebKit 性能风险、同版本缓存升级策略和需要用户明确授权。CI 的成功不能被称为已经发布。

## 2. 运行时白名单组装

脚本：`scripts/build-fymusic-phase44-candidate.mjs`
工作流：`.github/workflows/fymusic-phase44-release-gate.yml`

工作流从固定生产 SHA 的 `git archive` 构建**本地候选版**，仅覆盖以下 17 个经审计的运行时文件：

```
functions/api/proxy.js
index.html
modern.css
styles.css
src/app.js
src/mobile-shell.css
src/mobile-shell.js
src/modern-ui.js
src/music-lyrics.js
src/now-playing-experience.js
src/player-controls.js
src/source-manager.js
src/fymusic-cross-platform-match.js
src/fymusic-playback-verifier.js
src/fymusic-playback-core.js
src/fymusic-chain-report.js
src/fymusic-diagnostic-classifier.js
```

额外保护：
- 显式排除 `functions/api/fymusic-codec-selftest.js`、`functions/api/fymusic-range-selftest.js`、`functions/api/fymusic-throttle-selftest.js`；
- 显式排除测试专用 `src/fymusic-media-evidence.js`、`.github`、`docs`、`scripts` 和 `qa-fixtures`；
- 校验所有 index.html 本地链接文件及被诊断模块引用的实际 ES 模块依赖存在；最终仅允许**一个 HTMLAudioElement**；
- 断言 `origin/main` 与审计的固定 SHA 一致、无漏选运行时代码文件；候选版版本不得悄悄改动；
- 为每个覆盖文件生成 SHA256、源 SHA 和版本清单，上传 GitHub Actions artifact，仅用于审计，不表示部署。

如生产 main 更新，当前脚本会安全失败；必须重新审计再更新固定基线。

## 3. 自动化验收实证

Phase42：
- 原生 WebKit 24/24 + Firefox： https://github.com/lxhlw/Only-testing-online-music/actions/runs/41560895265
- 本地完整 CI： https://github.com/lxhlw/Only-testing-online-music/actions/runs/41560895228
- Edge Preview 完整 CI： https://github.com/lxhlw/Only-testing-online-music/actions/runs/41560895324

Phase43：
- 综合跨浏览器： https://github.com/lxhlw/Only-testing-online-music/actions/runs/41569768603 ，4/4 jobs successful。
- WebKit 12/12 组交互及媒体测试通过，但观测到少数单帧 344ms、148ms，无法据此声称真实设备不卡顿。

Phase44：
- 选择性运行时本地候选版的完整浏览器/Security/Privacy 测试：https://github.com/lxhlw/Only-testing-online-music/actions/runs/41572540383 ，**completed/success**，16 个成功步骤、1 个故障诊断按预期跳过。
- 覆盖：原有现代 Web 全套浏览器回归、Flower 代理安全、签名请求敏感值不滞留、Chromium/Firefox/WebKit 真实界面渲染和交互。
- Chromium p95≈16.7ms、Firefox p95≈17.1ms；WebKit p95≈17ms，但**单轮最大帧间隔曾到 3509ms**。未证明是站点代码还是 CI 浏览器/操作系统调度造成，必须单独分析。
- 针对 WebKit 冷帧补充了 `scripts/diagnostics/fymusic-phase44-webkit-cold-frame.mjs`，区分同步 DOM 更新耗时与等待下一 RAF 的时间。后续 CI：https://github.com/lxhlw/Only-testing-online-music/actions/runs/41572871709 。**本文件初次提交时该跑次仍未结束，最终状态和数据需再更新，不得伪报成功。**

## 4. 发布阻断项（不等于本阶段自动化失败）

1. **WebKit 长帧冷启动/实机验证**：Issue https://github.com/lxhlw/Only-testing-online-music/issues/106 仍需追踪。需在代表性的 Safari/iOS 或 WebKit 设备上记录首屏与首交互性能；CI 的 headless RAF 时间不是物理设备 FPS。
2. **正式版本号、缓存版本**：候选版沿用生产 `v0.4.26`，只用于差异审计；正式新版应在独立 release PR 中统一调整版本信息、缓存 query 和测试，再核查旧缓存升级。建议下一个版本号 `v0.4.27`，不是已发布声明。
3. **部署授权**：由用户明确同意后，才能创建和合并用于正式发布的精选运行时代码分支/PR，并触发 Cloudflare Pages 生产部署。默认不合并。
4. **范围**：隔离原创音频和可控源解析不代表所有第三方音乐均可播放；按用户要求，酷狗未通过专项不自动重新开展。不能宣称线上已经支持所有音源。

## 5. 经批准后的发布与回滚流程（尚未执行）

- 记录批准时的 main SHA 和对应 Cloudflare Pages 成功部署 ID；确认基线没有漂移。
- 基于 main **新建精选 release 分支**，仅放入审计批准的 17 个运行时文件和必要的独立版本/测试更新。不得合并超过 300 提交的整体开发分支。
- 先开 PR，完成生产工作流的 `pull_request` verify、源切换和回退测试、真实设备首交互性能验证；发布前审查 changelog、权限、边界与版本。
- 仅在用户授权后合并/部署 main；使用已验证的新版本及缓存查询键；查看 Pages 成功状态、资源完整性、JS 报错和实际播放状态。
- 如果发布后出现回归，通过受控的 **revert/恢复上一个已知可用 artifact** 回退并重新运行部署与版本核查，不直接强制重写 main 历史。执行任何回滚生产操作同样需要授权。

## 6. 下一步结论

Phase44 的**代码候选版筛选/安全检查/自动化浏览器验收**已完成，最终的冷帧辅助证据仍需核实。在无实机测试及明确发布授权前，生产发布状态是 **HOLD** 而非已上线。

本记录专供新对话续接，下一次“下一步”先核验最新 Phase44 CI 与 Issue #106，再决定是解决 WebKit 真实可见问题，还是准备经过授权的 release PR。
