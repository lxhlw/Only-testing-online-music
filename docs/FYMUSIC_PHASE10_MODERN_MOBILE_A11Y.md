# FyMusic Phase 10 — Modern Mobile Navigation & Accessibility

日期：2026-11-01（Asia/Singapore）

## 项目约束

- 按用户要求：本阶段专注现代 Web 手机触控、键盘交互和无障碍，不调查酷狗 404/502。
- 开发代码仅写入 `feature/fymusic-playback-verifier`；不合并或部署到生产 `main`。
- 不修改原始野花 LX 音源、签名、播放来源选择、最高音质能力或 KG→KW 人工确认规则。
- 不重新适配 Android 4.4.2。测试采用现代 Chromium 的 390×844 手机视口与触控模拟。

## 修复内容

### 移动主导航焦点与语义

文件：`src/mobile-shell.js`；Commit `17665ca8e54d07832c09fb9638c96f1c7ae8ab34`。

原先导航抽屉 Tab 约束只绑定在 `.main-nav` 上，不包括位于同一抽屉内但为兄弟节点的“关闭主导航”按钮。连续键盘操作可能离开已打开的抽屉。

现状：
- 打开手机导航时，在原有导航栏节点添加 `role=dialog`、`aria-modal=true`、中文可访问名称；桌面模式移除这些弹窗语义，原导航元素继续正常使用。
- 把 Tab/Shift+Tab 焦点循环监听移动到整个 `.nav-rail`，包括关闭按钮与所有当前可见导航按钮。
- 页面意外收到抽屉之外的焦点时将焦点拉回关闭按钮；按 Escape、触摸关闭按钮/遮罩或选择导航项后退出菜单、释放 `inert` 并恢复到菜单触发按钮。
- 手机/桌面响应式切换时，原导航 DOM 节点继续保持原位归属，不另造导航副本或重复绑定播放逻辑。

### 搜索平台浮层

同一文件：

- 打开浮层时，焦点移动到当前所选或第一个平台选项。
- 按 Escape 或选择平台后关闭浮层，焦点返回搜索平台触发按钮。
- 窗口宽度/高度变化（包括旋转和键盘导致的视口 resize）时关闭旧的、已经使用上一组坐标定位的浮层，防止出现离按钮很远的弹层。
- 弹层仍以原 DOM 节点移动到 `body`，避免被父层滚动区域遮挡；不增加网络请求。

### 触控区域和焦点可见性

文件：`src/mobile-shell.css`；Commit `babd3bad76a7001ffbd54bf491372a317b3d6cb8`。

- 手机菜单、抽屉关闭、搜索平台触发按钮与平台选项，实际触控区域至少 44×44 CSS px（较宽的文本按钮允许更大宽度）。
- 主要键盘操作按钮具有显著的 `:focus-visible` 2px 轮廓，不靠 hover 颜色作为唯一反馈。
- 没有添加高频 JS 动画或复原旧 Android WebView 兼容逻辑。

## 浏览器验证

测试文件：`scripts/test-fymusic-modern-mobile-a11y.mjs`；Commit `4c5e7649bdcb78f491ee9d3f707918df05149ec8`；视口回调时序修订 `836f409599e392b5e38229c3d2677e51d8b56c67`。

使用 Playwright Chromium，viewport 390×844、`isMobile=true`、`hasTouch=true`、`prefers-reduced-motion: reduce`。直接执行实际页面菜单和搜索渠道 UI 的点击、键盘 Tab/Shift+Tab、Escape、程序性焦点移动、页面 resize 和桌面切换。平台候选可用合成按钮作单机 UI 验证，**不涉及任何真正歌曲播放或第三方音乐平台解析**。

核实项目：
- 抽屉的模态语义和 `aria-expanded` 正确。
- Tab 从末个导航项回到关闭按钮，Shift+Tab 从关闭按钮回到最后导航项。
- 抽屉打开期间程序性焦点逃逸被阻止，Escape 返回菜单按钮。
- 主菜单、关闭按钮、搜索平台选择器按钮与候选按钮实际布局均满足最小 44px 高度/宽度要求（文本按钮宽度随文案扩展）。
- 打开平台选择器后焦点进入选项；Escape 与触摸选择之后焦点返回触发按钮。
- 改变手机视口尺寸会关闭位置已失效的弹层；在手机和桌面之间切换时 `inert` 与对话框语义恢复正确。
- 无脚本异常。

首轮 Edge CI 的测试读取太早，宽度调整后立即检查状态，未等待浏览器 `resize` 事件传播，因此出现测试失败；之后对 `aria-expanded` 和响应式 `inert` 使用有界 waitForFunction 等待。正式代码的 resize 清理逻辑不变，后续真实 Edge 和本地均成功。不可将首轮失败误称为第三方网络故障。

## 真实 CI

- [本地 Chromium 全量回归 Run 41274857489](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41274857489)：**completed / success**。包含移动端 `FYMUSIC_MODERN_MOBILE_A11Y_PASS`，以及已有的长歌词、增量歌单、同帧 UI 更新和签名请求调试脱敏等测试。
- [Cloudflare Edge UI 专项 Run 41274857493](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41274857493)：**completed / success**。严格核对 Cloudflare Pages 生产分支仍为 `main`，仅部署独立非生产 Preview；在 Preview 执行了同样的移动端回归，并验证长列表和歌词回归通过。
- 当前隔离预览： https://712bbcfc.only-testing-online-music.pages.dev
- 单次 CI 启动采样：First Contentful Paint 约 320ms，DOMContentLoaded 约 377ms，排除浏览器 idle 后 first-party/vendor 采样 CPU 约 28ms。**不是 A/B 性能提升百分比，也不是跨设备稳 60FPS 的证据**。

## 下一阶段方向

- 继续现代 Web UX：触屏歌单滚动及移动设备上的实际可见焦点/滚动位置，尤其打开/关闭全屏播放器的键盘与触控并发。
- 若需要更强的可访问性保证，可用 axe-core 等针对桌面/移动关键页面作静态规则审查，但不应拿 automated pass 冒充真实屏幕阅读器验收。
- 本阶段没有解决野花源时常 404/502、没有验证真实 FLAC/320k 的媒体码率；继续保持质量与网络失败事实清晰可追溯。
