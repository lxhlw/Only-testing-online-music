# FyMusic Phase41 — 前后台状态恢复偶发失败诊断（执行中）

日期：2026-11-03（Asia/Singapore）
仓库：https://github.com/lxhlw/Only-testing-online-music
开发分支：feature/fymusic-playback-verifier
生产 main 原始基线：c9a496ab580fb54775721b93a3944800bcaefc44

## 一、调查起点

Phase40 Edge Run 41483024487 的 attempt 1 曾在 `scripts/test-fymusic-foreground-lifecycle-browser.mjs` 第99行断言 `foreground should restore status class` 时失败，随后同一代码的 attempt 2 整套成功，记录 `FYMUSIC_FOREGROUND_LIFECYCLE_PASS`。不能把一次失败自动解释为源码错误或纯粹 CI 波动。

检查 `src/modern-ui.js` 的 `pendingUpdates`、`requestAnimationFrame`、`reconcileForeground`、`syncStatus` 路径后，当前仍缺少失败瞬间的 `#status` 实际文本和事件次序，尚不足以修改播放器业务源码。

## 二、Phase41 实际更改

仅修改测试和 CI，未修改播放器业务代码：

1. `scripts/test-fymusic-foreground-lifecycle-browser.mjs`：有界 90 条诊断，记录 `#status` 文本、`is-resolving` / `is-playing`、原生媒体时间、文档 hidden/focus、status / root MutationObserver 以及 `visibilitychange` / `pagehide` / `pageshow` / `timeupdate` 事件；在既有严格断言前记录 `FYMUSIC_PHASE41_FOREGROUND_DIAGNOSTIC`。提交 `fa686ff20f6b1432e2d85fa43399247b00edff60`。
2. `.github/workflows/fymusic-playback-verifier.yml`：Phase41 原有前后台生命周期测试改成 10 次独立 Playwright 浏览器实例运行。提交 `bc375687eba40ca6eb73e5066f2b61f86d8f9eca`。
3. `.github/workflows/fymusic-ui-preview.yml`：Edge Preview 同样改成 10 次独立运行。提交 `ace9f4ebfc92d397ed871a21e62d15106908097f`。

**强调：** 尚未获得本轮 10 次专项的成功/失败结果，不得声称阶段通过。首次遇到的明确失败必须保存原始诊断日志，再区分状态被异步回调更新与 RAF 没有恢复调度等原因。

## 三、已触发的 CI 及处理策略

- 本地 CI Run https://github.com/lxhlw/Only-testing-online-music/actions/runs/41487239418（含10次）
- Edge CI Run https://github.com/lxhlw/Only-testing-online-music/actions/runs/41487253013（含10次，提交后排队）
- 更早仅附加诊断的 Edge Run https://github.com/lxhlw/Only-testing-online-music/actions/runs/41487199681（单次）
- 更早仅附加诊断的本地 Run https://github.com/lxhlw/Only-testing-online-music/actions/runs/41487199484（单次）

截至本记录初稿时，部分运行仍在 Playwright 浏览器安装步骤或队列中；CI 因环境准备未达应用测试阶段，不能作为播放器故障证据。

## 四、下一步

1. 等到真实运行完成后，检查 `FYMUSIC_PHASE41_FOREGROUND_DIAGNOSTIC`、旧 `FYMUSIC_FOREGROUND_LIFECYCLE_PASS` 及首个失败断言前的事件顺序。
2. 如果实际 status 文本已被合法新状态覆盖，则测试需断言“当前 status 的实际文本与 CSS 是否一致”，不能永远假定人为填入的测试文本仍是当前状态；修改时保留生命周期不自动 play/load/seek 等严格断言。
3. 如果 status 文本仍是 `正在准备 synthetic background status`，但 class 为 false，才考虑 `src/modern-ui.js` 的 rAF 恢复调度竞态，并以真实复现为前提最小修复。
4. 增加一个明确的阶段结论与双成功 CI 证据后，再把此文档升级为完成交接。
5. 生产 main 不得未经用户授权部署。仍遵循现代 Web 流畅、单 audio、用户音质保护、用户暂缓酷狗、不适配 Android 4.4.2 的原有要求。
