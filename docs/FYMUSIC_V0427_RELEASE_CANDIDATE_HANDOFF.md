# FyMusic v0.4.27 精选发布候选版 / PR 交接

日期：2026-11-03 (Asia/Singapore)

## 1. 最重要的状态

**生产 main 未变更、未合并、未部署，发布需要用户显式授权。**

- 生产：`main` = `c9a496ab580fb54775721b93a3944800bcaefc44`，已上线基线 `v0.4.26`。
- 开发验证分支：`feature/fymusic-playback-verifier`。
- 独立发布候选分支：`release/fymusic-v0.4.27-rc`，HEAD = `ae562ef8ce1c22d85326bfe5a150c1cb38f2ab8b`。
- **草稿 PR #107**：https://github.com/lxhlw/Only-testing-online-music/pull/107 ，base `main`，head `release/fymusic-v0.4.27-rc`，`draft=true`，`merged=false`。
- 生产版本依然 `v0.4.26`，**v0.4.27 只是准备好的候选版**，不是已发布版本。

## 2. 代码集成方法

直接使用固定正式版 `main` 作为 Git tree 基线，精确复用 Phase44 审计的 **17 个运行时文件**（其中 `index.html` 更新了版本与关键缓存参数），另外仅覆盖 6 个发布辅助文件，共 **23 个改动文件**，只有**1 个**发布提交，未引入完整开发分支 300+ 提交历史。

17 个运行时文件：
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

发布辅助文件：
```
version.json
src/app-version.js
package.json
settings.html
.github/workflows/verify-and-deploy.yml
scripts/test-modern-web-browser.mjs
```

核心校验：
- `version.json`、`package.json`、`src/app-version.js`、`settings.html`、`index.html` 均与 `0.4.27` 一致，发布日期 `2026-11-03`。
- `index.html` 已将既有 `?v=0.4.26` 更新为 `?v=0.4.27`，并为 `src/app-version.js`、`src/player-controls.js`、`src/fymusic-playback-verifier.js` 补齐 `?v=0.4.27`。
- 正式部署的版本核对不再依赖硬编码 `0.4.26`，从当前 `version.json` 自动读取版本。该 workflow 的生产 `deploy` job 仅在 `main` push 或手动 dispatch 执行，不会由 PR 事件触发。
- 正式旧测试的唯一品牌断言从 `LX Music Web` 更新为 `FyMusic`。
- Git 树实测相对 main **恰好 23 个改变文件**，不含 `functions/api/fymusic-*-selftest.js`、`qa-fixtures`、Phase 测试脚本、额外 Actions 工作流和其它未经审计运行时文件。

## 3. 实际 CI 已全部成功

所有下列 Actions 均为 PR 事件，SHA 均为 `ae562ef8ce1c22d85326bfe5a150c1cb38f2ab8b`：

1. 完整现代 Web CI（含版本一致性、缓存、代理、浏览器）：https://github.com/lxhlw/Only-testing-online-music/actions/runs/41575431806 — **completed/success**，Verify 13 个成功步骤；**Production deploy job = skipped**。
2. Flower 代理安全：https://github.com/lxhlw/Only-testing-online-music/actions/runs/41575431743 — **completed/success**。
3. 队列与音源状态：https://github.com/lxhlw/Only-testing-online-music/actions/runs/41575431779 — **completed/success**。
4. 播放列表与交互：https://github.com/lxhlw/Only-testing-online-music/actions/runs/41575431750 — **completed/success**。

更早的非发布候选综合测试与 WebKit 对照：
- Phase44 isolated candidate https://github.com/lxhlw/Only-testing-online-music/actions/runs/41572871709 （success）。
- Phase45 8 对 WebKit A/B https://github.com/lxhlw/Only-testing-online-music/actions/runs/41574266790 （success）。本轮正式版最大间隔 254ms、候选版最大 99ms；样本不足以证明任何设备永远不卡顿。

## 4. 未完成的最后 1 个主要阶段

**实机性能验收、明确上线授权、正式部署和回滚验证**。为清晰可操作，拆分为门槛：

1. 在代表性 Safari/iOS 或实体 WebKit 环境对 `v0.4.27` 候选版进行首屏、首交互、列表、播放、Seek、系统控制、前后台切换复核，检查 WebKit Issue #106：https://github.com/lxhlw/Only-testing-online-music/issues/106 。无真实设备证据不虚称硬件流畅无卡顿；该 issue 保持 open。
2. 重查 `main` SHA，核查 PR #107 的 review/check 和 Cloudflare Pages 预览，记录可恢复的生产部署 ID 与 SHA。用户**明确批准发布**后再把 draft PR 变成可审查状态并选择合并部署；切勿擅自开启 auto-merge。
3. 发布后验证 `version.json`、网页脚本缓存、真实源播放和 UI/OS 系统控制的关键行为，复核生产 CI 与 Cloudflare 部署。若失败，执行用户授权的受控回滚，避免强制改写 Git 历史。

**用户下一次发送“下一步”**：先查询 PR #107、4 条 CI、Issue #106、main 是否漂移，优先处理真实设备 WebKit 验收与最终发布阻断；如果缺实机访问，应明确说明限制，而不是伪造通过。未经明确发布批准，严禁 merge 或 deploy 生产 main。正式部署前还需要检查上游音源可用性：此前用户要求暂缓酷狗专项，且不要求适配 Android 4.4.2。

## 5. 原始交接资料

- `docs/FYMUSIC_PHASE44_RELEASE_AUDIT.md`
- `docs/FYMUSIC_PHASE45_WEBKIT_AB_HANDOFF.md`
