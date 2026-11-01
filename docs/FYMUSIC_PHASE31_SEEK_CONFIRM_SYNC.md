# FyMusic Phase 31 — 原生播放确认与进度条即时同步

**交接日期：2026-11-02（Asia/Singapore）**  
**开发分支：** `feature/fymusic-playback-verifier`  
**正式代码修复提交：** `aedf1546fa77d9d6dec9eaf8668558aac13a7181`  
**生产 main：** `c9a496ab580fb54775721b93a3944800bcaefc44`（未修改）

## 1. 结论

Phase 31 已完成。原生音频确认播放后，播放器进度条曾短暂保持 disabled，即使 `audio.duration = 12`、真实 FLAC 24-bit / 96kHz 已开始解码播放、`playbackState.waitingForAudio = false`、`playbackState.playing = true`。专项诊断确认这**不只是 Cloudflare Edge 特有的问题**，本地 Chromium 同样存在，均由播放确认与 UI 刷新的事件执行顺序造成。

现通过在 `confirmAudioPlayback()` 的状态转换后立即执行已有的 `LXPlayerControls.refresh()` 解决。该刷新仍依据播放状态、URL、真实 audio 时长等判断有效性，不是直接强制 `seek.disabled=false`。不增加定时器、轮询、第二播放器或音质自动降级。

## 2. Phase30 交接基线与证据

- 基线文档：`docs/FYMUSIC_PHASE30_TRUE_HIDDEN_CDP_MEDIA.md`。
- 开发初始 HEAD：`063a588fdc83ce809a2a62d16ad56c44eafc07a2`。
- Phase30 本地与 Edge CI 成功，但原脚本对 seek 不可用的情况仅标记为“无法验证”，而不是失败。
- Phase31 初始诊断提交 `8a98fdcd07dbadd4ceb8be1d3125c1aa2c643b97` 添加真实 UI 状态轨迹及更严格的等待断言。正式播放器此时未修改。
- 初始诊断的两套完整 CI 已通过：本地 [41340622486](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41340622486)、Edge [41340622652](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41340622652)。通过是因为其允许等待进度条稍后恢复；轨迹仍完整捕获了初始错误。

### 诊断前后状态

| 位置 | 首次观察：已经确认播放却 disabled | 下一次原生 timeupdate 后 |
|---|---|---|
| 本地 Chromium | `currentTime≈0.390s`、`waitingForAudio=false`、`playing=true`、`baseDisabled=true` | `currentTime≈0.654s`，`baseDisabled=false` |
| Cloudflare Edge | `currentTime≈0.430s`、`waitingForAudio=false`、`playing=true`、`baseDisabled=true` | `currentTime≈0.694s`，`baseDisabled=false` |

两边均观察到约 **264ms** 的额外刷新等待。这是所记录样本中的时间差，不是对所有设备延迟的普遍量化。

### 根因

`src/player-controls.js` 的 `refresh()` 使用 `duration() && state.url && !state.waitingForAudio` 决定 seek 是否有效。真实 `timeupdate` 上，它可能先于 `src/app.js` 的 `audio.ontimeupdate → handleAudioPlaying() → confirmAudioPlayback()` 运行。随后播放状态转为 confirmed，但原先没有同步调用 `refresh()`，于是 UI 暂留在确认之前的 disabled 状态，直到下一次媒体事件再刷新。

## 3. 代码与测试修改

1. `src/app.js`：在 `confirmAudioPlayback()` 设置 `waitingForAudio=false`、`playing=true` 后立即调用现有 `LXPlayerControls.refresh()`；沿用其有效状态判定，不直接解除禁用。
2. `scripts/test-fymusic-phase31-seek-state-browser.mjs`：基于真正的 headed Chromium、Xvfb、原始 CDP、单 `audio`、原创真实 FLAC 和 UI 选曲，附加**只读**状态采集。检查首次观察到 `waitingForAudio=false` 的真实 `timeupdate` 中，`baseDisabled` 必须已经是 `false`，还检查沉浸式拖动预览、真实 hidden/visible 与暂停/恢复。
3. `scripts/test-fymusic-phase30-raw-cdp-real-hidden.mjs`：不再允许“seek unavailable”时略过未提交拖动取消验证；必须确认 seek 可操作，再触发预览及真实隐藏取消。
4. 两套工作流 `.github/workflows/fymusic-playback-verifier.yml`、`.github/workflows/fymusic-ui-preview.yml`：均增加 Phase31 文件的语法检查与 **3 次独立浏览器进程/临时 profile** 运行；保留所有先前回归，并继续执行原有 Phase30。

## 4. 修复后真实 CI 验证

| 验收 | Workflow run | 结果 |
|---|---|---|
| 本地 Chromium 完整测试 | [41341467945](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41341467945) | completed/success，43 steps |
| Cloudflare Edge 独立预览完整测试 | [41341467914](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41341467914) | completed/success，41 steps |
| 现有 Flower KW 回归 | [41341467922](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41341467922) | completed/success |
| 现有额外 Edge Preview 回归 | [41341467927](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41341467927) | completed/success |

**本地 3/3、Edge 3/3：** 真实确认播放的首个 `media:timeupdate` 状态记录均为 `stateWaiting:false`、`statePlaying:true`、`baseDisabled:false`。三次真实拖动取消和 hidden/visible 验证也均输出通过标记。额外 Phase30 正式回归在两边均看到 `seekPreviewAvailable:true`。

隔离预览地址：**https://8bf66744.only-testing-online-music.pages.dev/**

额外 Edge Preview 地址：**https://0c0a2347.only-testing-online-music.pages.dev/**

两套 Edge 工作流日志均有 `FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。生产站点未按本阶段要求部署。

## 5. 验证边界

- 本阶段使用原创受控素材与解析器，不可声称真实野花平台所有歌曲均已修复。
- 这不是实际 Android/iOS 锁屏或实体设备音频焦点测试。
- 请求音质标签与音频实际编码仍须区分；保留高音质、单播放器、明确跨平台/降级授权原则。
- 用户此前暂缓酷狗专项排查，本阶段没有重新扩展这一范围。
- 不恢复 Android 4.4.2 适配，也不增加永久轮询。
- 正式 `main` 截至本次提交前再次确认保持 `c9a496ab580fb54775721b93a3944800bcaefc44`。

## 6. 下一阶段建议

Phase 32 优先围绕真实使用体验做有界验证：针对可操作进度条执行真实拖动提交和 Media Session seek 的一致性检查，以及桌面/移动沉浸式 UI 的瞬时状态同步，关注切歌和变更音质时旧请求不能污染当前播放。若新证据表明已无 UI 问题，可将工作重心转回现代 Web 的性能与稳定性，不把受控测试误称为第三方音源全面成功。
