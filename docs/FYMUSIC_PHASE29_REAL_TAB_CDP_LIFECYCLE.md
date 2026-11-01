# FyMusic 第二十九阶段：Chromium 生命周期能力、暂停恢复及解析中更改音质一致性

日期：2026-11-01 / 2026-11-02（Asia/Singapore）

## 0. 最终状态与安全边界

- 仓库：`lxhlw/Only-testing-online-music`。
- 开发分支：`feature/fymusic-playback-verifier`。
- **通过两套完整 CI 的代码提交：`02c7a98a3997867e95e047320dd9d351818bfb52`。**
- 生产 `main`：`c9a496ab580fb54775721b93a3944800bcaefc44`，从本阶段开始至结束始终未修改、未合并，也未部署正式生产。
- 本阶段只新增 QA 脚本 `scripts/test-fymusic-phase29-real-tab-lifecycle-browser.mjs`，并接入既有两条工作流：
  - `.github/workflows/fymusic-playback-verifier.yml`
  - `.github/workflows/fymusic-ui-preview.yml`
- 正式 `src/app.js`、`src/player-controls.js`、`src/now-playing-experience.js`、音乐源、CSS 和动画均未修改。
- 旧第 1–28 阶段回归全部保留，包括受控真实音频 MP3/AAC/FLAC、24-bit/96kHz FLAC、HTTP 200/206、缓冲恢复、移动端、Media Session、封面、状态竞态、播放与搜索操作。
- 无第二播放器、生产轮询、128kbps 强制上限或未经批准的跨平台音乐源自动切换。

## 1. 阶段目标

对第二十八阶段的受控真实 UI 链进一步增加：

1. 实际打开第二个 Chromium 页面并将其置前，观察原始播放器页面的**原生** `document.visibilityState` 与 `document.hidden`，不人为覆写 DOM 属性或伪造 `visibilitychange`。
2. 在恢复前台后观察音频的原生播放进度、当前 URL 和媒体请求次数是否正常。
3. 在用户通过现有 Media Session 处理器**明确暂停**音乐后，调用 Chromium CDP 的 `Page.setWebLifecycleState({state:'frozen'})`，随后 `active`；检查命令被接受，恢复后歌曲仍暂停，没有越权自动播放或新的音频请求。
4. 用户点击 B 并产生 `320k` 解析请求后，**解析器未返回之前**保存新偏好 `flac24bit`；应保持这次点击所捕获的 `320k` 请求，而非悄悄换音质或改播放身份。
5. 最终仍由真实 `#audio` 解码合法原创媒体，通过真实 HTTP 206 请求；继续验证系统控制、旧元数据、过期解析回调、来源标签、音质标识均正确。
6. 区分命令成功、浏览器可见性变化和真实 OS 冻结/锁屏，不将其中任何一项替代其他证据。

## 2. 受控测试实现

脚本重用第二十八阶段的真实搜索行点击、`startPlayback`、音质计划及 `requestAction` 业务链，另外创建同一个 Playwright BrowserContext 的第二个页面。

- A：WY 渠道、用户请求 `flac24bit`、播放 FFmpeg 原创的真实 24-bit / 96kHz FLAC。
- 额外页面置前时，**记录**播放器的实际 `visibilityState`，监测原生媒体时间，并将前台还原。要求期间播放源不被更换、原音频不被重复请求、恢复后播放时间继续推进。若浏览器没有进入 hidden，不能将此用例称为验证了后台隐藏恢复。
- 设置偏好为固定 `320k`、关闭自动降级。切换到 KW 搜索标签时，不得将仍在播放的 A 误标为 KW。
- 真实点击 KW 的 B 搜索结果行，使 B 的受控请求记录为 `320k`。**在受控解析回调尚未返回时**再将保存的偏好改为 `flac24bit`，但本次已存在的 B 请求仍必须是 `320k`；之后返回合法的原创测试 MP3 并真实解码播放。
- B 选中后，受控旧 WY 元数据和重复旧解析回调返回；不得覆盖当前 B 的页面/OS 信息，也不得造成旧 AAC 文件的音频 HTTP 请求。
- 使用页面真正注册到受控 Media Session API 的 `pause` 函数暂停 B，然后调用真实 CDP `Page.setWebLifecycleState` 冻结/恢复。恢复后 B 仍应暂停、URL 不变、没有第二个播放器及重复媒体请求。最后再使用原系统媒体 `play` 处理器恢复，确认播放器实际时间继续推进。
- 第 28 阶段合成 `visibilitychange/pagehide/pageshow` 的测试还保留作独立 UI 事件处理回归，但**本阶段不会将这种派发事件等同于真实系统隐藏或锁屏**。
- OS Media Session API 在测试环境用受控实现捕获 metadata/handlers；音频解码和 currentTime 是实际 HTMLAudioElement，不是模拟。

## 3. CI 的真实可见性发现

两套通过的 CI 均显示：

```json
{
  "nativeVisibilityOnTabSwitch": "visible",
  "nativeHiddenActuallyObserved": false,
  "nativeVisibleAfterTabReturn": "visible",
  "freezeCommandSucceeded": true,
  "freezeUnsupportedReason": null,
  "nativeVisibilityBeforeCDPFreeze": "visible",
  "explicitOSPauseRemainedPausedAfterFreeze": true,
  "requestedQualityOnBClick": "320k",
  "changedPreferenceWhilePending": "flac24bit",
  "pendingRequestQualityUnaffected": true,
  "noDuplicateMediaRequests": true,
  "noActualDeviceLockscreenClaim": true
}
```

**重要：真实 hidden 状态并未发生。**

- 两套环境虽实际创建第二个页面并切换前台，但该 Playwright/Chromium 构建仍报告 `document.visibilityState === 'visible'`。因此不存在“真实隐藏页面恢复已通过”的证据。
- CDP 接受了 `frozen` 与 `active` 命令，未返回错误；恢复后用户主动暂停的状态、歌曲和资源请求数量均正确。但**仅凭命令成功不能证明真实设备的冻结、锁屏、后台调度、冻结事件触发或 OS 媒体权限行为**。
- 这是一项真正明确环境边界的结果。下阶段若要证明原生 hidden/前后台，需要另有支持实际隐藏的浏览器环境、真实操作系统设备或可复现的窗口管理测试，并记录系统实际发送的状态和事件。

## 4. 双 CI 实测

| 项目 | 本地 Chromium | Cloudflare Edge |
|---|---|---|
| 整体 CI | completed/success | completed/success |
| 通过步骤 | 41 | 40 |
| 本次代码提交 | 02c7a98... | 02c7a98... |
| 通过 HTTP 的原创 FLAC/MP3 | 206/206 | 206/206 |
| CDP 冻结与恢复操作 | 成功返回 | 成功返回 |
| 真实 hidden 状态被观察到 | 否 | 否 |
| 暂停后恢复仍保持暂停 | 是 | 是 |
| 不必要的媒体重复请求 | 无 | 无 |
| 等待中的 B 请求保持 320k | 是 | 是 |
| 新保存的音质偏好 flac24bit | 是 | 是 |
| 旧歌曲解析与元数据隔离 | 是 | 是 |
| 单一 HTMLAudioElement | 是 | 是 |
| 真实 OS 锁屏已测 | 否 | 否 |

证据：
- [本地 Chromium Run 41328110372](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41328110372)：`completed/success`，41 成功步骤。
- [Cloudflare Edge Run 41328110334](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41328110334)：`completed/success`，40 成功步骤。
- 独立 Preview URL：**https://73ade0e4.only-testing-online-music.pages.dev**。
- Edge 部署安全日志 `FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。
- 日志标识：
  - `FYMUSIC_PHASE29_REAL_TAB_LIFECYCLE`
  - `FYMUSIC_PHASE29_QUALITY_PLATFORM_OS_MATRIX`
  - `FYMUSIC_PHASE29_NATIVE_LIFECYCLE_PASS`

## 5. 失败和修正历史（必须保留）

1. 首版代码提交 `3a614e8e1fca7607806f405b166cbabf4a0e4673` 的测试首先使用 `browser.newPage()`，然后试图 `page.context().newPage()` 创建第二标签页；Playwright 报 `Please use browser.newContext()`。这是**新增测试初始化错误**，并非播放器功能故障。
2. 中间提交 `1f73b3053dd3d79cc7f2ea6afe61f4ab3fcc90fc` 修正了无头浏览器可能始终报告 visible 的证据边界，但尚未修复上述 BrowserContext 初始化，不能标记为通过。
3. 最终提交 `02c7a98a3997867e95e047320dd9d351818bfb52` 显式创建 `const context=await browser.newContext(...)`、`await context.newPage()`，消除初始化错误；两条完整 CI 全绿。
4. 本文档为 CI 全绿后**单独提交的文档变更**，不会修改被验证代码，也不能把 docs-only HEAD 误称为重新执行了全部代码 CI。

## 6. 未解决问题与第二十阶段之后的方向

- 本阶段没有重新开启用户暂缓的酷狗或野花问题，也未验证指定歌曲**孙燕姿《开始懂了》**在真实第三方音源可播；这一问题的状态保持不变。
- 尚无 Chrome 真正 `hidden`、系统锁屏、真实移动设备后台冻结/恢复的合格证据；下一步优先建立可以产生原生 hidden 的外部或设备环境，再测试播放器在冻结、恢复、音频焦点中断后的真实行为。不能假设 CI headless 是真实后台。
- 继续关注快速音质变更的竞态、用户在请求等待中重新选曲以及旧响应取消。音质请求 `320k` 不等于真实文件是 320kbps，本轮测试 MP3 仍为原创 QA 编码。
- 不应因此添加系统定时轮询或双播放器架构，保持现代 Web 性能及 Cloudflare Pages 的生产隔离。
