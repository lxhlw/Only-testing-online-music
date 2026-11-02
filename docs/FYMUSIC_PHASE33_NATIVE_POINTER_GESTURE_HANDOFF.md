# FyMusic Phase 33 — 原生鼠标/触摸进度手势归属与状态保护

**日期：2026-11-02**  
**仓库：** https://github.com/lxhlw/Only-testing-online-music  
**开发分支：** `feature/fymusic-playback-verifier`  
**Phase32 基线：** `ab5fd6e765f1d63de9238796d363c1ad218d0834`  
**本阶段修复提交：** `72a5d696e0b700c2221debb81eb015d85b332cf8`  
**最终验收用测试提交：** `2198fbb26228da9e89acb304f11ccd812c5c5003`  
**生产 main：** `c9a496ab580fb54775721b93a3944800bcaefc44`，保持不变。

## 一、结论

Phase33 已完成并通过开发分支双完整 CI。除了 Phase32 的浏览器事件派发，本轮直接使用 Chromium 原生鼠标按下/移动/松开和 CDP `Input.dispatchTouchEvent` 真实触摸事件，在真实原创 FLAC 24-bit/96kHz、真实 HTTP 206、单个原生 `audio` 的条件下检查冲突。

**结论：**

- 原有沉浸式进度条在原生触摸拖动与 Media Session seek、切歌冲突下正确保留最新播放归属，未见新问题；这部分通过的原因是 Phase32 已修复，Phase33 加强了真实手势证据。
- 底部主进度条原来没有独立处理真正的鼠标手势所有权。Phase33 发现并修复了新的真实缺陷：OS 已将音频跳至 3 秒，仍在拖动的旧鼠标继续移动并松开，原实现将音频再次跳到约 10.26 秒。
- 修复后：即使浏览器继续派发旧的原生 `input/change` 事件，也不会再修改 `audio.currentTime`。系统程序化 seek 仍然有效，正常后续新鼠标和键盘操作仍可使用。
- 保持高性能事件驱动，不新增轮询、持续定时器、第二 `audio`，不修改解析器或音质策略，不部署 main。

## 二、来源与事件归属

相关代码：

- `src/player-controls.js`：底部主进度条原本只有 `dragging` 预览标志；`pointerup` 之后的原生 `change` 会读取当前滑块值，写入当下歌曲的 `audio.currentTime`，没有区分旧拖动与新的 OS/歌曲归属。
- `src/modern-ui.js`：Phase32 已在系统 `seekto/seekbackward/seekforward` 之前发出 `fymusic:external-seek` 事件。
- `src/app.js`：选曲通过 `lx:trackchange` 通知当前歌曲变更。
- `src/now-playing-experience.js`：Phase32 已对沉浸式 `#detail-seek` 做预览失效处理。

Phase33 在 `src/player-controls.js` 中新增轻量的 `pointerHeld` 和 `ignoreOldPointerCommit` 状态：

1. 只有真实指针正在按住底部 `#player-seek` 时，收到 OS 外部 seek 或曲目变更才将旧指针提交标记为过期；同时立即清理旧的预览。
2. 过期指针产生的可信原生 `input` 不再进入预览逻辑，尾随的可信 `change` 不再提交。注意原生 `change` 事件本身仍可能抵达，不能误认为浏览器不会发它。
3. OS 通过正式代码主动派发的非可信 DOM 事件仍能通过原有合法 `commitSeek` 路径改变原生媒体时间。
4. `pointerup` 不能过早清除过期标记，因为浏览器的 `change` 常在 `pointerup` **之后**才派发。
5. 后续新的 `pointerdown`、键盘手势能够开启新的合法输入；`pointercancel` 也清理旧预览，不改动原生媒体时钟。

## 三、真实故障复现

阶段第一笔新增测试提交：`58d903271a5b20949e5c733d86656b61c3a64651`，增加真正触摸场景，运行本地和 Edge 均成功（Runs `41372544440`、`41372544419`）。

第二笔新增桌面鼠标测试提交：`484b31626ed1f70cfe69ec687508d0e8a7bfe8ab`。最初测试把 CSS 6px 的主进度条误设为要求高度不少于 8px，此失败只涉及测试几何条件。测试校正提交 `8d1f743bd9ae510eb3ecbd8eea1e46ce6b7336f2` 后，用真实鼠标拖动稳定重现：

```json
{
  "afterOS": 3,
  "nativeMouseReleaseCausedAudioTime": 10.26,
  "rawChangeEvents": 2
}
```

复现 CI： https://github.com/lxhlw/Only-testing-online-music/actions/runs/41373092213

真正的可信 DOM 事件包含 `pointerdown`、连续 `pointermove`、`input`、`pointerup`、`mouseup`、`change`，而不是测试伪造滑块事件。浏览器在真实 Flac 解码情况下确实被旧拖动修改了音频时间。

## 四、修复与测试断言的严谨性

修复提交 `72a5d696e0b700c2221debb81eb015d85b332cf8` 让原生媒体时钟保持 OS 指定的 3 秒。但浏览器仍会派发 2 个 DOM `change` 事件，不能把收到事件次数当成实际提交次数。

为避免错误断言，测试后来在真实 `HTMLMediaElement.prototype.currentTime` getter/setter 上设置**仅记录的透传包装**：读取和写入仍调用浏览器原生访问器，保持真实音频时钟、解码和 seek，不是模拟播放时钟。

最后修正的测试提交 `2198fbb26228da9e89acb304f11ccd812c5c5003` 还将“可信输入事件”判定严格限定到当前鼠标手势，避免把先前 OS 主动派发的非可信 DOM 事件混入统计。

## 五、最终 CI 与原生证据

| 验证 | GitHub Actions Run | 状态 |
|---|---|---|
| 本地 Chromium 完整回归 | https://github.com/lxhlw/Only-testing-online-music/actions/runs/41373571626 | completed / success，46 个工作流步骤 |
| Cloudflare Edge 独立 Preview 完整回归 | https://github.com/lxhlw/Only-testing-online-music/actions/runs/41373571558 | completed / success，44 个工作流步骤 |

每套均通过 Phase33 原生鼠标 + 原生触摸两个专项（合计 4/4 成功），并通过 Phase32 两轮、Phase31 三轮和之前的旧版完整测试。

**鼠标冲突修复后，本地与 Edge 均得到：**

```json
{"current":3,"commits":1,"rawChanges":2,"writes":[3],"previewHidden":true}
```

这明确区分「原生浏览器派发 2 个 change」和「底层媒体时间只被写入 1 次」。真实鼠标切歌前后音频时间保持一致；旧指针后续移动与松手不会额外写入新曲播放位置。

**原生触摸测试：** 使用 CDP `Input.dispatchTouchEvent`，记录 `isTrusted=true` 的 `pointerdown/touchstart/touchmove/input/touchend`，确认系统 seek 结束后 3 秒保持不变且仅提交一次；新歌曲 B 被选中后，旧触摸结束没有改变新歌时钟。音频请求两首均返回 206。

**隔离 Edge Preview：** https://be6fbb9b.only-testing-online-music.pages.dev/  
**生产保护日志：** `FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。本阶段未部署生产。

## 六、范围与后续建议

这次是真实 Chromium 浏览器及原生解码和真实输入事件的测试；Media Session 的 OS 命令通过受控注入的 handler 调用，**不是**实体手机系统锁屏测试；不代表全部真实第三方音源已可用。音频源为原创受控 FLAC，不声称第三方歌曲通过。旧版 Android 4.4.2 不在目标内，酷狗专项仍暂缓。

建议 **Phase34** 重点：非模拟的浏览器失焦/前后台或页签切换发生在鼠标或触摸长按途中时的操作归属；实际触控设备和 OS Media Session 差异；快速重复拖动、方向改变、切歌与滚动的交叉压力。维持事件驱动、单播放器、清爽流畅现代 Web 和只在开发分支验收的原则。
