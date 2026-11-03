# FyMusic Phase42 — WebKit 原生 seek 回退和连续键盘位置归属修复

日期：2026-11-03（Asia/Singapore）
开发分支：feature/fymusic-playback-verifier
Issue：https://github.com/lxhlw/Only-testing-online-music/issues/105
生产 main：c9a496ab580fb54775721b93a3944800bcaefc44（禁止未经用户明确授权合并或部署）

## 一、两种真正复现的原生竞态

1. Phase41 Edge 的 WebKit 实例：OS seekto(1.85) 的原生 setter 成功，立即读取 currentTime≈1.8625，但随后在没有应用 setter 的条件下又读到上一轮≈3.0942；首次可信 ArrowRight 就从旧时间跳到≈3.1242，而目标应≈1.8926。可查 Run 41490752709 第18轮和 Run 41489563288。
2. Phase42 第一版提交后的独立24轮测试 Run 41560090876：前20轮通过，第21轮连续 ArrowRight 的原生 setter 确实写入下一目标，但 WebKit currentTime getter 暂时未变化；测试严格断言捕获“连续键操作仍取旧原生位置”的风险，不能只看 setter 次数。

## 二、事件驱动代码修复（没有 sleep/poll）

- src/modern-ui.js：fymusic:external-seek 从普通 Event 升级为带精确 seconds 目标的 CustomEvent，仍由现有 LXPlayerControls 负责实际 media.currentTime 赋值，不新增第二播放器。
- src/now-playing-experience.js：当 OS seek 打断旧的指针/触摸预览，记录被覆盖的显式 OS seek 目标，限定 currentSrc 和 track sequence；第一次可信键盘按键以这个最新目标定位原生 range 滑块，不凭未确认的 native currentTime getter 盲目刷新。
- 同时为每一次有效原生 range change 记录 pendingNativeSeek；在原生 seeked 成功、currentTime 真正到达**当前**已提交目标之前，沉浸式滑块和随后连续的键盘操作都以最后一次用户目标为准。
- 严格使用小于约半个 native range tick 的完成容差，避免把紧邻上次 seek 的 seeked 当作下一次操作已经完成。
- 新 pointerdown、track/source 替换、Escape/失效手势路径清理归属，不复用旧歌曲的时间目标。
- 保留真实 seek setter 为单一的 base player controls；UI 归属修复不额外调用 audio.play、audio.load、audio.currentTime。
- 没有固定定时器、后台轮询、提前回退音质或自动换源。

关键代码提交：
- 984ebb49da9d1fcc2bff5a68ecf51709b425503a（OS event target）
- 48f7563c9d3677c94ec277225c96a533663b868a（OS 目标归属）
- 9ae05f18c75979946a35685cf2c24cde07092cb1（连续 native keyboard 目标归属）
- ff0fa189972360b6fe64d917548fab5e747c1284（原生 getter 最终确认严格断言）
- 4189fdf8fad5af4d69ac0a2a70749a01ffc96165（严格识别最新 seeked 的半 tick 目标）

## 三、真实浏览器压力证据

新的原生 WebKit 专项工作流：
.github/workflows/fymusic-phase42-native-seek-ownership.yml

- 真实 Playwright WebKit + Firefox 浏览器内核，不是改 UA。
- 本地独立 Cloudflare Pages 原创 MP3，真实浏览器 HTMLAudioElement 和 setter。
- 系统 seekto 注册为 QA 的 OS Media Session 模拟动作；WebKit 指针、鼠标拖动、键盘按键均为可信原生输入；没有伪造 audio 时钟。
- 每个 WebKit 会话包含八组 OS seek + 废弃指针 + 原生键盘交错、六次 keydown 连续、四次独立按键、A→B 换曲后首键归属、单音频实例、真实 HTTP Range 与网络证据。
- 调整后不依赖“写入 setter 时 native getter 必然同步变化”的错误假设；现在**同时**严格验证真实 setter 的目标值、原生滑块目标连续递进，以及最后一笔 seek 的真实 native `seeked` / currentTime 最终落点，没有降低误跳容忍阈值。
- Run https://github.com/lxhlw/Only-testing-online-music/actions/runs/41560666792 （第二版、原始严格快照模式）成功 24/24。
- Run https://github.com/lxhlw/Only-testing-online-music/actions/runs/41560895265 （最新收紧的 setter+最终落点模式）**completed/success，24/24**，Firefox 专项通过、无断言失败。
- 最新代码 SHA 4189fdf8fad5af4d69ac0a2a70749a01ffc96165 在 CI 中由独立 checkout 检查执行。

## 四、仍需独立确认的完整回归

最新本地全套 CI：https://github.com/lxhlw/Only-testing-online-music/actions/runs/41560895228
最新独立 Cloudflare Edge Preview 全套 CI：https://github.com/lxhlw/Only-testing-online-music/actions/runs/41560895324

本文件初次提交时两者仍在执行，**未验证前不得宣称完整双 CI 成功**。必须分别记录最终 run status/conclusion、成功步骤数、Preview 地址、是否所有 Phase31–42 回归通过，并更新此文档。不要因为专项 24/24 通过而忽略整套回归。

## 五、交接与剩余阶段

预期后续分两阶段：
- Phase43：综合跨浏览器长会话性能、流畅动画、原生播放队列、源/音质归属和稳定性验收；真实设备/三方授权来源的能力边界需明确，不自动重启此前暂缓的酷狗专项。
- Phase44：正式版本和开发分支差异复核、部署前安全检查、验收报告与推荐；生产部署只有用户明确授权才可操作。

Phase42 即使专项通过，也须先核验本地和 Edge 全回归结果，才可标记完成。如仍有失败，先定位原因再决定是否追加阶段。

下一次用户说“下一步”，优先读取本文和当前 GitHub Actions 的最终状态，不盲目重复 Phase31–41 已验证项目。
