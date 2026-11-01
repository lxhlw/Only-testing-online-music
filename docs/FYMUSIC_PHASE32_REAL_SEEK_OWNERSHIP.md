# FyMusic Phase 32 — 真实进度跳转、Media Session 与旧拖动归属修复

**交接日期：2026-11-02（Asia/Singapore）**  
**项目：** FyMusic · https://github.com/lxhlw/Only-testing-online-music  
**开发分支：** \`feature/fymusic-playback-verifier\`  
**Phase31 交接基线：** \`b091a1bd46f0e1da0e6df7096cdf227c89b455f6\`  
**Phase32 正式修复提交：** \`ab460e94b099b61053bc672faea4160307ea9257\`  
**生产 main：** \`c9a496ab580fb54775721b93a3944800bcaefc44\`（本阶段未修改）

## 一、阶段结果

**Phase32 已完成。** 已定位并修复使用沉浸式进度条时与外部播放控制发生的操作归属竞态。现有原生播放器、音质策略、真实播放进度确认、Cloudflare 独立预览隔离均保持不变。

本阶段主要不是进一步添加相似的播放解码测试，而是解决了实际用户可能遇到的错误跳转：拖动进度条尚未松手时，系统媒体控制或新选曲接管播放；旧拖动的 \`change\` 事件迟到，导致未经用户新操作同意的二次跳转。

## 二、测试前真实复现

首先提交独立测试：

- \`3ca5a8b7f2d0585a89c421c789470c1339809fdd\`：新增 Phase32 真实音频、UI 跳转、Media Session、旧事件归属测试与双工作流接线。
- \`ee72b7eee0aeac7934b3649370c96636442fc14d\`：修正仅测试用例的移动端隐藏导航按钮点击方式；不修改生产播放器。首次 CI 因 Playwright 拒绝点击隐藏侧栏而失败，不能误写为播放缺陷。

随后在未应用生产修复时，**本地和 Edge 都稳定重现实际业务故障**：

\`\`\`json
{"afterOS":3,"afterLateChange":11.04,"commits":2,"previewHidden":true}
\`\`\`

以上数据来自：

- 本地 CI： https://github.com/lxhlw/Only-testing-online-music/actions/runs/41343025515
- Edge CI： https://github.com/lxhlw/Only-testing-online-music/actions/runs/41343025519

浏览器确实将真实 \`audio.currentTime\` 从 OS 指定的 3 秒再次修改为 11.04 秒，而不是仅出现进度条视觉错位。

## 三、根因与修复

### 1. Media Session 与未完成的沉浸式拖动

\`src/modern-ui.js\` 的 Media Session \`seekto/seekbackward/seekforward\` 会将目标写入主进度控件，派发已有的 \`input\` 和 \`change\` 让播放器执行合法跳转，但原本没有通知沉浸式模块取消正在进行的拖动。之后的旧 \`#detail-seek\` \`change\` 事件可覆盖 OS 指定位置。

修复：Media Session 通过既有可操作进度条验证后，在实际设置 OS seek 目标之前，发出轻量事件 \`fymusic:external-seek\`；沉浸式模块接收后仅在存在旧预览时使其失效，忽略该预览迟到的最后一次提交。媒体跳转仍通过原有主进度条业务流程处理。

### 2. 切换歌曲时旧拖动对新歌曲的污染

\`src/now-playing-experience.js\` 的 \`setTrack()\` 原本会直接取消显示中的拖动预览，但未保护随后到达的旧 \`change\`。当 B 已准备播放时，A 的旧交互可能继续触发无意义甚至错误的 seek。

修复：在歌曲切换时同样调用 \`invalidateSeekPreview()\`，在清理预览的同时标记迟到的旧提交不可执行。新一次合法 \`input\` 会复位这个标记，正常拖动不受影响。

### 3. 性能和原则

- 保持唯一 \`<audio id="audio">\` 原生媒体播放器。
- 不新增持续定时器、轮询或额外 MSE 业务播放器。
- 不直接强制修改 \`seek.disabled\`。
- 不修改固定音质或未经允许的回退策略；测试固定请求 \`flac24bit\`。
- 不向其他音乐平台静默切歌。
- 不为 Android 4.4.2 添加兼容逻辑。

## 四、新增验收及实际证据

新增：\`scripts/test-fymusic-phase32-real-seek-ownership-browser.mjs\`

测试使用 Playwright Chromium 的 390×844 手机视口、真实搜索行触发的应用选曲、受控解析器、原创 FLAC 24-bit/96kHz、实际 HTTP 206 媒体请求和真实 \`audio.currentTime\`。Media Session API 使用受控注入方式触发处理器，不虚构手机锁屏；测试中部分 DOM \`input/change\` 通过浏览器事件派发来复现迟到提交，并非宣称已做实体手机的手指轨迹测试。

严格检查：

1. 普通拖动预览不能在提交之前修改真实媒体时钟；沉浸式 \`change\` 只提交一次，目标为约 6.3 秒。
2. Media Session \`seekto(4)\`、\`seekbackward(2)\`、\`seekforward(3)\` 通过已有控制链确实改变真实媒体位置。
3. OS 跳至 3 秒并覆盖正在进行的 92% 拖动；旧拖动 \`change\` 触发后播放仍为 3 秒、总提交仅一次。
4. 从 A 选到 B 后，即使旧 A 的 \`change\` 再到达，B 的播放时钟不变、额外提交数为零。
5. 当前歌曲元数据和 Media Session 标题仍为 B，两个进度条可操作、当前仅一个音频节点。
6. A、B 均有真实 HTTP 206；没有假造媒体播放事件或音质结果。

### 最终 CI（修复提交 ab460e94）

| 环境 | Run | 结果 |
|---|---|---|
| 本地 Chromium 完整历史回归 | https://github.com/lxhlw/Only-testing-online-music/actions/runs/41343187232 | completed/success，44 步 |
| Cloudflare Edge 独立 Preview 完整历史回归 | https://github.com/lxhlw/Only-testing-online-music/actions/runs/41343187136 | completed/success，42 步 |

本地和 Edge 各执行 **两次独立浏览器测试，2/2 成功**。四次日志均出现：

\`\`\`json
{"afterOS":3,"afterLateChange":3,"commits":1,"previewHidden":true}
\`\`\`

四次切歌后旧事件测试均记录 \`changes:0\`，旧事件之前和之后的新歌时钟一致，Media Session 标题均为 \`Phase32 Original B\`，没有第二个 audio。

两套完整 CI 均继续包含之前 Phase1–31 的回归，包括 Phase31 真正页面 hidden/visible、原生 FLAC、HTTP Range、元数据与音质状态验证。

**独立 Preview：** https://ac7cf0b8.only-testing-online-music.pages.dev/  
Edge 日志有 \`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main\`，没有部署到生产 main。

## 五、边界与 Phase33 建议

本阶段修复是受控真实音频与真实浏览器 UI/DOM 事件链的验证，不能当成真实第三方所有平台、所有歌曲已经成功播放，也不是实体手机的物理触摸或 OS 锁屏验证。原生 seek 的媒体目标和实际位置得到确认；部分场次没有捕获 \`seeked\` 事件，不应夸大为所有场次的完整 seeked 事件时序保证。

后续 Phase33 可优先研究：真实指针/触摸手势长拖动及释放与 HTML Range 默认行为的交互；快速切歌或失焦时的旧交互保护；移动浏览器系统 Media Session 的兼容差异。持续保持事件驱动、页面顺滑、单播放器、高音质、来源身份一致性与开发生产隔离。暂缓酷狗问题，不进行 Android 4.4.2 适配。
