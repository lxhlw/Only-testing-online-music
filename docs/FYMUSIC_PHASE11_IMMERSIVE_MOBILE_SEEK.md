# FyMusic Phase 11 — Immersive Mobile Seek & Orientation

日期：2026-11-01（Asia/Singapore）

## 范围与安全边界

- 用户当前要求继续现代 Web UX；**暂不排查酷狗远端失败**。
- 只修改 `feature/fymusic-playback-verifier`，Cloudflare 只部署与生产分支隔离的 Preview，不修改 `main`。
- 不修改原始 Flower 脚本、音频解析路线、跨平台显式用户确认和质量声明；不重新适配 Android 4.4.2。
- 浏览器交互测试以假设的媒体持续时间、进度和合成输入驱动，**不代表第三方音乐真正解码或测得 FLAC/320k**。

## 关键修复

### 1. 全屏进度条预览/确认/取消状态

文件 `src/player-controls.js`，提交 `7815ca686fba973293fc8b62aa2f510d7d39e69b`：
- 新公开 `LXPlayerControls.cancelSeek()` 用于将迷你播放条的 `dragging` 状态复位，隐藏其跳转预览提示，按真实 `audio.currentTime` 刷新显示。
- 取消动作不写入音频 currentTime，不发起新的音源请求。

文件 `src/now-playing-experience.js`，提交 `eb87bdec42e572098852361fc58e7da696f0f7b3`、修复 `7517c6a9b8fcfa5845a50d1d4675a639509fbd4a`：
- `seekPreview` 将拖动预览与已经确认的音频位置区分。输入更新临时显示时间与 `aria-valuetext`，只在 `change` 时向原有迷你播放条分发**一次**确认操作，复用既有受控权限判断。
- `pointercancel`、正在预览时的 Escape、关闭全屏或切歌时取消预览，清除原播放器的 `dragging` 标志。
- 防止取消后随即产生 `change` 事件误把旧预览提交为跳转。
- 不在只保持键盘焦点、未处于预览状态时冻结进度显示，避免长期不更新。
- **发现并修正**一个跨浏览器焦点边界：若取消跳转触发了底层进度条 disabled，先前的第二次 Escape 可能无法继续抵达弹层。现在第一次 Escape 取消预览后将焦点移到稳定的全屏关闭按钮，使第二次 Escape 正常关闭页面。

### 2. 旋转、模态焦点与移动触控区域

同一 `src/now-playing-experience.js`：
- 全屏打开时拦截程序性焦点逃逸，确保键盘焦点留在弹层中；关闭后把焦点归还原先触发元素，若已从 DOM 移除则退回迷你播放器的封面按钮。
- 只在全屏歌词标签可见时响应 `resize` 和 `visualViewport.resize`，以单帧合并方式立即重新居中当前歌词；不增加周期轮询。

`modern.css`，提交 `f6ef52896445fce0a452a4981531264c28ae1bd2`：
- 在手机宽度下将沉浸式进度条实际操作区域扩到至少 44 CSS px，播放控制按钮至少 44×44 CSS px。
- 提供明确键盘 focus-visible 轮廓；保留底部安全区。手机横屏且视口高度较小时缩小上方封面栏和标签栏，避免压缩实际控制区域。

## 受控 Chromium 回归

新增 `scripts/test-fymusic-immersive-mobile-seek.mjs`，提交 `752639f8d8f0e675e6a8b25cb125d370ed91da21`：

- 移动 390×844 Chromium + touch + prefers-reduced-motion。
- 假设音频 200 秒 / 当前 30 秒，仅在浏览器中模拟 `HTMLAudioElement` 属性以测试 UI。
- 验证进度条和控制按钮最小 44px 操作高度；输入预览与屏幕阅读器 aria-valuetext 同步。
- `pointercancel` 后真实 currentTime 不变、底层预览隐藏、后续 `change` 不会额外提交；正常确认恰好发出一次原生 `change`。
- 即使 slider 已有键盘焦点，未拖动时 `timeupdate` 仍更新真实位置。
- 连续 Escape 先取消预览、再退出全屏；触发按钮焦点归位；全屏打开时意外焦点逃逸会转回弹层。
- 手机横屏 740×390 时进度条仍在可视区域内，恢复竖屏后弹层可正常关闭。
- 所有 URL/歌曲/音频业务均未参与测试，更不能把以上数据用于声称某首歌曲已播放成功。

### CI

- [本地 Chromium 完整回归 Run 41278232732](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41278232732)：**completed / success**。`FYMUSIC_IMMERSIVE_MOBILE_SEEK_PASS`；上一阶段的手机导航、长歌词、增量歌单、请求签名隐私回归也通过。
- [隔离 Cloudflare Edge UI Run 41278232752](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41278232752)：**completed / success**。严格校验 `production_branch=main`，仅生成开发 Preview；真实 Edge 页面里再跑相同的 Chromium UI 回归成功。
- 最新隔离预览：https://d0d520c5.only-testing-online-music.pages.dev
- 这次 Edge Linux CI 首次内容绘制约 300ms、DOMContentLoaded ~422ms，约 23ms 可归因 CPU 样本，不是稳定 FPS 或性能提升百分比保证。

首次新的本地专项 CI `41278161553` 失败：第二次 Escape 没有关闭全屏。首轮 Edge CI `41278165172` 在其当时环境下成功，但未覆盖到同一边界行为。随后改进焦点处理，最终本地和 Edge 同时成功。**不要抹掉这一中间失败或认为首次 CI 已全部通过。**

## 下一步建议

- 后续继续关注真实触屏物理设备行为：进度条边缘拖动、窄屏横竖屏切换、软键盘打开时 `visualViewport` 更新，以及屏幕阅读器焦点操作。
- 若要做跨设备帧率保证，需要设备真机滚动与播放时的长期性能指标，不能根据单次 CI FCP 推断。
- 生产 `main` 直到用户正式授权前维持不变；Flower 酷狗问题仍明确不在本阶段范围。
