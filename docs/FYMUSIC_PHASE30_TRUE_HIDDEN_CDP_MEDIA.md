# FyMusic 第三十阶段 — 原生 Chromium 真正隐藏标签页与 FLAC 继续播放

日期：2026-11-01（Asia/Singapore；跨日对话日期为 2026-11-02）

## 1. 最终结论

**第三十阶段完成。** 这次补齐了第二十九阶段缺失的「真正 `document.hidden === true`」证据：

- 通过独立启动的**有界面 Chromium**（在 CI 的 Xvfb 虚拟显示器运行），并使用 **原始 Chrome DevTools Protocol**，而非 Playwright 管理的浏览器页面。
- 浏览器自身建立、激活另一标签页后，FyMusic 的原始页面确实先后收到原生可见性变化，**序列为 `hidden → visible → hidden → visible`**。测试没有覆盖 `document.hidden` / `document.visibilityState` 属性，也没有派发伪造的 `visibilitychange` 事件。
- 独立测试网页运行 FyMusic 真实的搜索平台、搜索行、播放控制、受控音源解析业务路径，加载由上一阶段生成的原创 **FLAC 24-bit / 96kHz** 音频；原生 HTMLAudioElement 发出实际 HTTP **206** 请求，媒体时间真实推进。
- 第一次页面隐藏/恢复后仍是同一首、同一 URL、唯一一个 `audio` 元素，没有重复下载，播放进度继续推进。
- 第二次隐藏前，用户经生产系统媒体控制回调明确暂停；恢复前台后仍保持暂停。明确执行系统 `play` 后媒体继续播放。系统媒体 API 在浏览器测试里仍采用受控 mock，**不是实际手机硬件或锁屏控制**。
- 本地 Chromium 和隔离 Cloudflare Edge Preview 的全部 CI 最终都成功；生产分支没有合并或部署。

## 2. 代码和分支

| 条目 | 内容 |
|---|---|
| 仓库 | `lxhlw/Only-testing-online-music` |
| 开发分支 | `feature/fymusic-playback-verifier` |
| 完整双 CI 通过的功能提交 | `095e613cde64c51a621c8b6c7bc6b4c46c24fc8c` |
| 生产 `main` | `c9a496ab580fb54775721b93a3944800bcaefc44`（未修改） |
| 新增代码 | `scripts/test-fymusic-phase30-raw-cdp-real-hidden.mjs` |
| 更新工作流 | `.github/workflows/fymusic-playback-verifier.yml`、`.github/workflows/fymusic-ui-preview.yml` |

此次**没有改动任何正式业务源文件**，没有添加生产轮询、第二播放器、低音质强制封顶或自动跨音乐平台后备解析；不再适配 Android 4.4。

## 3. 为什么之前没有真正 hidden

既有 Playwright 测试 `scripts/test-fymusic-phase29-real-tab-lifecycle-browser.mjs` 能检查 CDP 冻结/恢复命令，但 Playwright 管理的页面在该无头 CI 环境里即使切换标签仍报告 `visible`。这不等于真正测试了浏览器 Page Visibility API。

本轮通过原始 CDP 控制有界面 Chrome 的 `Target.createTarget` 与 `Target.activateTarget`；**没有通过 Playwright 客户端激活或焦点模拟来改变可见性状态**。CI 使用：

```bash
xvfb-run -a -s "-screen 0 1440x900x24" node scripts/test-fymusic-phase30-raw-cdp-real-hidden.mjs
```

新增测试使用 Node.js 的 WebSocket 原始协议客户端、临时 Chrome `user-data-dir`、动态 DevTools 端口、有限超时和进程清理。只有真实返回 `hidden`、原生页面可见性事件记录完整、播放恢复等严格断言均通过，才输出 `FYMUSIC_PHASE30_REAL_VISIBILITY_PASS`。

同时把本阶段专项放在长时间的历史 HTTP 暂停对照之前，测试错误可尽早发现；**仍保留所有上一阶段 CI 用例，不以快速测试代替完整回归**。

## 4. 双环境原始结果

| 验证项目 | 本地 Chromium | Cloudflare Edge Preview |
|---|---|---|
| GitHub Actions | completed/success | completed/success（失败后重跑成功） |
| 成功步骤 | 42 | 41 |
| 实际浏览器版本 | Chrome/153.0.8010.12 | Chrome/153.0.8010.12 |
| 原生可见性变化事件 | hidden, visible, hidden, visible | hidden, visible, hidden, visible |
| 真正 `document.hidden` | true | true |
| 原创 FLAC 24-bit / 96kHz HTTP | 206 | 206 |
| 第一次隐藏时真实媒体时间 | 1.570 秒 | 1.522 秒 |
| 恢复后播放器继续播放 | 是 | 是 |
| 系统控制主动暂停再隐藏 | 恢复仍暂停 | 恢复仍暂停 |
| 用户主动继续播放 | 实际推进时间 | 实际推进时间 |
| 音频重复请求 | 0 | 0 |
| 原生 audio 元素 | 1 | 1 |
| 页面 DOM 或媒体伪造事件 | 无 | 无 |
| 实际手机锁屏 | 未测试 | 未测试 |

运行链接：

- 本地 [Run 41331679582](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41331679582)：42 个通过步骤。
- Edge [Run 41331679562](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41331679562)：第 1 次在旧前台 UI 用例失败，第 2 次**同代码重跑** 41 个步骤均通过。
- Edge 最新独立非生产预览：**https://b87dad87.only-testing-online-music.pages.dev**
- 安全检查日志：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。

关键日志标识：

- `FYMUSIC_PHASE30_PREVIEW_CAPABILITY`
- `FYMUSIC_PHASE30_RAW_CDP_REAL_HIDDEN`
- `FYMUSIC_PHASE30_REAL_VISIBILITY_PASS`

## 5. 本阶段真实发现的 UI 条件差异

本地测试结果：

```json
{"overlay":"false","seekHidden":false,"available":true,"reason":null,"mediaDuration":12,"baseDisabled":false}
```

- 原创 FLAC 正在播放时，沉浸式进度滑块可用，模拟用户开始（**未提交**）一次拖动预览，然后浏览器**真实**进入 hidden 状态。
- 页面恢复后，未提交的预览已取消，播放没有跳到预览位置。本地日志明确 `uncommittedSeekCancelled: true`。

Edge 测试结果：

```json
{"overlay":"false","seekHidden":true,"available":false,"reason":"live player seek currently disabled","mediaDuration":12,"baseDisabled":true}
```

- Edge 虽然真实音频已加载、有时长、可播放，但当时页面的 `#player-seek` 及沉浸式 seek 控件均为禁用状态。
- 因此本轮 **不能声称 Edge 的未提交拖动取消已验证**；日志为 `seekPreviewAvailable:false`，`uncommittedSeekCancelled:null`。
- 其他真实 hidden、播放进度、暂停恢复、无重复 HTTP、单播放器验证仍通过。
- 这是后续需要具体诊断的 UI/播放状态不同步候选问题：先复现并比较 `LXPlayerControls.refresh()` 的有效播放状态判定、`audio.duration`、音质/来源身份，再决定是否修改生产代码，不允许为 CI 变绿就强行启用 seek。

## 6. 失败与修正历史

1. 首版功能提交 `872d7dfeacd215cf7c372c05d924c1633d61e397` 在本地、Edge 的新增 UI 预览准备阶段失败，只有不充分的 `Page JS Uncaught`。此时**没有完成原生 hidden 验证**，不得将该提交描述为成功。
2. 修正提交 `095e613cde64c51a621c8b6c7bc6b4c46c24fc8c`：增强 CDP 异常详情；对可用 seek 进行真实断言，而不可用 seek 记录为不可验证；将新增测试提前执行，减少不必要的历史长测重复。两套环境均通过该提交的 Phase30 原生 hidden 专项。
3. 本地完整回归 42 步通过。Edge 首次通过了原生 Phase30，但随后历史 `test-fymusic-foreground-lifecycle-browser.mjs` 第 99 行 `foreground should restore status class` 偶发失败。重跑**完全相同提交**的 Edge 作业后，该旧用例通过，并完成 41 步全绿。没有因这一问题修改正式播放器或绕过旧测试。
4. 本文档是双 CI 最终全绿之后单独创建的 docs-only 交接，不是新的可执行代码提交，也不应冒充重新执行过完整 CI。

## 7. 验证边界与第三十一阶段建议

- 已完成真实桌面浏览器页面可见性隐藏/恢复验证；**没有**验证真实 iOS/Android 系统锁屏、媒体焦点中断、系统后台休眠后的长期播放可用性。
- 受控音乐源、真实网站播放路径、真实原创 FLAC，没有请求野花/酷狗的实际商业歌曲；用户明确暂缓的酷狗问题及指定孙燕姿《开始懂了》的真实第三方播放尚未验证。
- 本阶段把 `LXPlaySettings` 的质量标识与实际媒体内容保持区分，不将受控解析器宣称的质量等同于真实第三方媒体的码率。
- **第三十一阶段优先建议**：隔离排查 Edge 下真实音频可播放但进度滑块禁用的原因；增加多次独立新浏览器上下文的可重复性测量，判定是否只是时序竞态，再以严格前台、真正 hidden、恢复多轮试验验证可能的修复。遵守现代 Web 性能、单播放器及生产隔离。
