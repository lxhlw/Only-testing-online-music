# FyMusic Phase 18 — Real Chromium Media Lifecycle with Delayed Audio Fixture

日期：2026-11-01（Asia/Singapore）

## 项目约束

- 产品名：FyMusic。GitHub：`lxhlw/Only-testing-online-music`。
- 仅在 `feature/fymusic-playback-verifier` 开发、通过 Cloudflare Pages **非生产 Preview** 发布测试代码，`main` 和生产站点保持不变。
- 用户暂不排查酷狗/Flower 上游的真实播放失败，不适配 Android 4.4.2；不改现有解析、签名传输、音质选择与需要人工确认的 KG→KW 备用切换规则。
- 用户此前指定的真实歌曲验证目标为孙燕姿《开始懂了》（非《成都》《郭源潮》），但**本阶段没有请求或验证该歌曲或任何第三方音源**；以下成功仅代表受控音频 WAV 的真实 Chromium 解码/播放生命周期。
- 继续追求现代 Web 浏览器的顺畅交互，不新增后台重试、播放循环、持续动画或影响播放的定时器。

## 本阶段目标

Phase 17 已有 `scripts/test-fymusic-weak-network-recovery-browser.mjs`，主要通过模拟媒体元素状态与手动派发事件验证弱网络 UI 的“无自动播放/跳转/加载”行为。

Phase 18 则验证真实 Chromium `HTMLAudioElement` 在**有真实可解码的 PCM WAV 数据、HTTP 网络请求与人为延迟的媒体响应**中如何产生原生事件，补齐合成事件无法证明的浏览器解码链路。另验证用户显式暂停、媒体时长/进度、seek、无效媒体响应、错误后只有新显式动作才恢复播放。

## 新增真实媒体事件回归

新建 `scripts/test-fymusic-real-media-lifecycle-browser.mjs`，提交 `304080dd3040272d63a0ce2e2e0a4064b33fbb41`。

- 在测试脚本中用 Node Buffer **生成 8 秒、8000Hz、440Hz 单声道 16-bit PCM WAV 校准音频**，并通过 Playwright 的页面 HTTP 路由向 Chromium 提供；测试使用真实解码器与原有页面唯一 `#audio` 元素，没有伪造 `duration`、`paused`、`currentTime`、`readyState` 或手动派发媒体事件。
- `/fymusic-phase18-slow.wav` 故意延迟 1100ms 才提供真实 WAV 字节。实际 DOM 监听器记录原生 `waiting`、`loadstart`、`loadedmetadata`、`canplay`、`playing`、`timeupdate` 事件；在等待时已有 Phase 17 的缓冲提示出现，加载/解码后自动清除。
- 用户测试动作明确调用一次 `audio.play()`，待真实播放进度大于 0.3s 后主动 `pause()`。随后模拟 BFCache `pagehide/pageshow` 与 `online`，断言 `play/load/pause` 调用次数不变，位置保持且不会意外自动播放。
- 只有再一次显式调用 `audio.play()` 才继续该 WAV 的真实进度，然后把真实音频位置设为 2.5 秒，观察原生 `seeking` 和 `seeked`。
- `/fymusic-phase18-invalid.mp3` 返回 HTTP 200 + HTML，验证 HTMLAudioElement 原生 `error` 与非成功的媒体状态，以及错误后的 BFCache/online 不调用自动重播/加载/重试。
- 显式把 media src 切换到 `/fymusic-phase18-good.wav`，新 WAV 被真实解码并产生进度，证明错误之后不是隐式跨平台回退，而是一次新的、显式的测试选择。
- 响应状态/请求次数在测试环境内验证；无第三方音频、歌曲名、签名、签名 URL 或真实授权商业音乐请求。浏览器测试成功不表示对真实音源 CDN 断网恢复已实现。

最终输出：
`FYMUSIC_REAL_MEDIA_LIFECYCLE_PASS`

关键结果：`realChromiumDecoder=true`、`controlledWavSeconds=8`、`delayedLoadingWaiting=true`、`nativeMetadataAndPlayback=true`、`nativePauseResume=true`、`realSeekEvents=true`、`realMediaErrorOnInvalidContent=true`、`noUnrequestedErrorRecovery=true`、`explicitValidFixtureRecovery=true`、`delayedFixtureRequests=1`、`invalidFixtureRequests=1`、`validFixtureRequests=1`、`noExternalMusicRequests=true`。

## 修复移动端旧测试中不稳定的初始化竞态

第一次 Edge 全量 CI：`41302160394`，在先前存在的 `scripts/test-fymusic-modern-mobile-a11y.mjs` 的“QA Channel A”虚构按钮定位上超时。该按钮由测试脚本临时插入，但 Edge 初始化的音源列表偶尔会在稍后刷新并移除先前注入的 fixture；这不是新媒体解码测试失败，也不涉及真实音乐上游。

修复文件：`scripts/test-fymusic-modern-mobile-a11y.mjs`，提交 `0d3560d37f03341eeb5da79f8b06443d9f33b325`。

在第二次打开来源选择弹层后、执行触屏点击之前，若 QA 按钮已被异步重新渲染清除，则重新向弹层的现有 DOM 注入安全 fixture。测试仍然使用真正的 Playwright `tap()` 与弹层 focus/ARIA 验证，不通过绕过 UI 或选择在线 LX 音源来让测试成功。

## CI、预览与生产隔离

- CI 工作流 `.github/workflows/fymusic-playback-verifier.yml`、`.github/workflows/fymusic-ui-preview.yml` 新增此测试的路径过滤、`node --check` 和真实 Chromium 测试步骤；全部现有移动端、音乐播放测试、媒体证据、歌词、系统媒体控制、快速切歌、封面和弱网络回归保留。
- [第二轮本地 Chromium Run 41302342760](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41302342760)：`completed/success`。
- [第二轮 Cloudflare Edge Preview Run 41302342744](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41302342744)：`completed/success`。包含 `FYMUSIC_MODERN_MOBILE_A11Y_PASS` 与 `FYMUSIC_REAL_MEDIA_LIFECYCLE_PASS`。
- Edge CI 证明部署前 `FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`；最新隔离 Preview：https://89c0e48b.only-testing-online-music.pages.dev
- 单次 Edge 启动性能参考：First Contentful Paint 276ms，DOMContentLoaded 361ms，脚本 CPU 抽样约 26ms。非 A/B 测试，不代表真实设备稳定 60FPS。
- 本阶段没有修改生产 `main`，最终 HEAD 需以 GitHub 分支复核为准。

## 下一阶段建议

如果用户继续说「下一步」，可考虑开展**真实短音频分块 Range / 断流及恢复的浏览器实测**，将浏览器原生的 `waiting` 和 `stalled` 触发条件逐步覆盖到媒体中途缓冲，而非仅测试起始 1100ms 网络延迟。可考虑测试移动端网络切换时播放界面状态，仍需避免声称真机锁屏、真实长时间播放或野花源可播。未经明确授权，所有实现仍仅开发分支/隔离 Cloudflare Preview。
