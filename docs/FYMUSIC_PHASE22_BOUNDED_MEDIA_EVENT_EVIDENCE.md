# FyMusic 第 22 阶段 — 有界事件证据与 MP3 前置数据量对照

日期：2026-11-01（Asia/Singapore）

## 1. 阶段目标与真实结论

- 继续 FyMusic 现代 Web 稳定性开发；**不解决或重启酷狗/野花上游排障**。
- 在实际 Chromium `#audio` 元素上使用有界、纯事件驱动的采样器记录首次 `playing`、首个真实播放进度、播放中途原生 `waiting`、自然 `playing` 恢复、累计等待耗时、`stalled` 和诊断资源释放；同时检查缓冲 UI。
- 对比同一项目授权 MP3 测试音频、同一 11 秒 HTTP 网络停顿，在前置 136、280、460 帧（分别约 3.55、7.31、12.02 秒媒体数据）条件下实际行为。
- **两套 GitHub Actions 全部 completed/success**，包含原有完整回归。

当前测试环境下，136 帧延迟至网络恢复后才启动播放；280 与 460 帧都出现快速启动，播放中途真实等待，然后恢复。较多前置音频缩短当前这一次固定网络停顿造成的缓冲耗尽时间，但这**不是通用阈值或最佳配置建议**。

## 2. 开发隔离和改动

仓库：`lxhlw/Only-testing-online-music`

- 开发分支：`feature/fymusic-playback-verifier`。
- 最后获得完整 CI 通过的代码提交：`a244a627c495871ae37876a46b963acb62d5e301`。
- 生产 `main`：`c9a496ab580fb54775721b93a3944800bcaefc44`，未修改、未合并、未进行正式部署。
- 未修改真实播放器的 `src/app.js`、`src/player-controls.js`、音源解析、用户音质、静默跨平台回退或正式播放链路。
- 所有测试使用已有唯一 `#audio.src`。没有第二播放器、MSE、新后台定时器、WebSocket 或手工伪造原生媒体事件。

新增或修改的实际文件：

1. `src/fymusic-media-evidence.js`：**仅由 QA 测试动态导入**，正式页面运行不自动执行。针对既有 HTMLAudioElement，按需安装 9 种媒体事件监听，记录最多 48 条最近事件的固定大小循环缓冲，保留聚合指标（首次播放、首次进度、等待/恢复、耗时、错误）。不读取/上传音乐 URL、歌曲身份或签名参数；没有持续轮询；`dispose()` 幂等解绑全部监听器。
2. `functions/api/fymusic-range-selftest.js`：仅 `mode=primed&format=mp3` 支持经白名单限制的 `leadFrames=136|280|460` 和 `gapMs=11000|16000`。缺省参数继续对应第二十一阶段的 460 帧 / 16 秒，保持所有旧测试。
3. `scripts/test-fymusic-phase22-lead-browser.mjs`：使用真实 Chromium、本地/Edge 服务端 HTTP 分块、真实音频原生事件与 FYMusic 提示；依次执行三种参数，确保实际字节发送、媒体播放进度、诊断有界且已经销毁；460 帧样本必须出现真正播放中途 waiting、自然恢复与提示。
4. `.github/workflows/fymusic-playback-verifier.yml` 和 `.github/workflows/fymusic-ui-preview.yml`：将新增测试加入路径过滤、语法检查和自动执行；旧回归没有删减。

本阶段指标专用于 QA，不是对正式用户音质、预缓冲策略进行硬编码修改。

## 3. 实测结果

测试音频：项目授权 MP3 校准帧，每帧 209 字节，1,600 帧，合计 334,400 字节。真实 HTTP 中断约 11 秒。

### 本地 Chromium

| 前置帧 | 首次原生 playing | 中途 waiting | 自然恢复次数 | 重新缓冲总时长 | 真实最大网络间隔 |
|---:|---:|---:|---:|---:|---:|
| 136 | 11,033ms | 0 | 0 | 0ms | 10,999ms |
| 280 | 14ms | 1 | 1 | 6,938ms | 11,001ms |
| 460 | 16ms | 1 | 1 | 2,834ms | 10,995ms |

### Cloudflare Edge Preview

| 前置帧 | 首次原生 playing | 中途 waiting | 自然恢复次数 | 重新缓冲总时长 | 真实最大网络间隔 |
|---:|---:|---:|---:|---:|---:|
| 136 | 11,045ms | 0 | 0 | 0ms | 10,998ms |
| 280 | 25ms | 1 | 1 | 6,934ms | 10,995ms |
| 460 | 57ms | 1 | 1 | 2,831ms | 10,996ms |

- 三组均实际接收 334,400 字节的受控 MP3 网络流，无外部歌曲请求。
- 136 帧：播放未在中断期开始，因此没有“播放中途 waiting”，不应把 startup waiting 算进去。
- 280 与 460 帧：真实 `timeupdate` 已发生，随后浏览器自然触发 `waiting`，网络恢复后 `playing` 恢复并继续增长 `currentTime`；FyMusic 缓冲提示在等待期间实际出现。
- 两套环境的 460 帧均直接确认 `playing` 发生在媒体请求完成前。本地 280 帧也获得该请求完成时间比较证据；**Edge 的 280 帧虽显示提前 `playing` 和中途 `waiting`，但媒体请求完成时间未被该检测器可靠确认，因此该单项比较结果不算直接证明**。
- 全部采样器 `eventCount<=48`、`recorderDisposed=true`，没有持续轮询或正式播放器额外开销。
- 指标表示单轮受控 CI 结果，不应解释为统计学上的平均启动速度、移动设备流畅度或普适质量预测。

## 4. 真实 CI 和 Preview

- 本地完整 Chromium：[Run 41315054354](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41315054354) — `completed/success`。
- Cloudflare Edge Preview：[Run 41315054443](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41315054443) — `completed/success`。
- 本阶段隔离预览：**https://1724e295.only-testing-online-music.pages.dev**。
- Edge 保护标识：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。
- 两边均记录 `FYMUSIC_PHASE22_LEAD_COMPARISON`、`FYMUSIC_PHASE22_EVENT_EVIDENCE_PASS`。
- 旧的真实 `audio.src` MP3 缓冲耗尽、MSE、Range、WAV、移动端、Media Session、资源压力和内存等回归均保留且成功。

## 5. 尚未完成及下一阶段建议

1. **真实第三方音乐**：孙燕姿《开始懂了》、野花上游、酷狗真实 URL 播放问题未在本阶段检查，不能声称已修复。
2. 当前 136/280/460 对照只是同一重复 MP3 测试帧的三个采样点；未知真正的最小开播字节阈值，不能推广到 AAC、FLAC、真正的高音质 MP3 或其他设备。
3. QA 事件采样器已证明有界和可清理，但目前并未被集成到正式生产播放器，不存在真实用户长期运行的性能指标。
4. 没有多设备长期 60FPS、实际 Android/iOS 锁屏、运营商网络弱网统计或曲目元数据变化条件下的横向证明。
5. **第二十三阶段建议**：优先完善可重复、可比较的媒体启动基线，隔离客户端 Range 请求和 HTTP 中介对启动时间的影响；使用受控的不同编码/合法 Range 条件测试。可以加强单音频元素的实际恢复路径而不是盲目增加上游解析重试。
6. 保持现代浏览器性能优先、不兼容 Android 4.4.2、不强制 128k、不静默改换歌曲平台。任何真正生产合并/部署都需要用户明确批准。
