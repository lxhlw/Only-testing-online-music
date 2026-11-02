# FyMusic Phase40 — Firefox/WebKit 原生键盘连续跳转与焦点归属修复

日期：2026-11-03（Asia/Singapore）  
仓库：https://github.com/lxhlw/Only-testing-online-music  
开发分支：**feature/fymusic-playback-verifier**  
Phase39 交接 HEAD：2cc7c5d5e2d8bf9ffda7641170f4a0c1ae4f7af8  
Phase40 正式播放器代码修复：7191d1d47ed2cfdd46eddc84835084cb9e50cc8f  
生产 main：c9a496ab580fb54775721b93a3944800bcaefc44（没有修改、合并或部署）。

## 一、结论

**Phase40 已完成。本地与 Cloudflare Edge 独立 Preview 完整 CI 均 completed/success。**

新增 Firefox/WebKit 真正浏览器原生 range、真实原创 MP3 解码、键盘跳转与旧拖动事件归属检查。测试目录及 URL 解析器和 OS handler 注册为 QA 受控，而非虚构的媒体播放进度或伪造音频事件。Phase39 旧手势保护全部回归成功。

新增测试及工作流文件：
- scripts/test-fymusic-phase40-cross-engine-keyboard.mjs
- .github/workflows/fymusic-playback-verifier.yml
- .github/workflows/fymusic-ui-preview.yml

正式源码修复：
- src/now-playing-experience.js

## 二、故障证据与精确根因

本阶段最初覆盖 ArrowLeft、ArrowRight、Home、End、PageUp、PageDown 共八组测试，独立使用同引擎的原生 range 控件校准实际步进差异；旧鼠标被系统 seek 覆盖后，新键盘必须以真实 audio.currentTime 为基准。Firefox/WebKit 均通过。

但 6 次连续 browser keyboard.down('ArrowRight') 仅产生 1 次原生 currentTime setter 写入。进一步提交严格断言 663394093f046954a5a9ba1e4fa8892706e87665：不重新聚焦，同一个 slider 连续四次独立可信 ArrowRight，每次需准确提交一次真实 seek，且焦点始终保持。

未修复时，Edge Run 41482688291 的 Firefox 原始日志：
- FYMUSIC_PHASE40_CONSECUTIVE_KEY_firefox，i=0，from=4.62，to=4.65，writesDelta=1，focused=false。
- AssertionError: firefox native seek slider must retain keyboard focus after change。

根因：src/now-playing-experience.js 的滑块 change handler 在键盘与鼠标两种交互下都无条件执行 fullSeek.blur()。按一次方向键后焦点离开滑块，后续按键不能继续调整。这是真实生产源码问题，不是测试 duration 或日志问题。

## 三、最小修复

提交：
https://github.com/lxhlw/Only-testing-online-music/commit/7191d1d47ed2cfdd46eddc84835084cb9e50cc8f

引入轻量 seekInputFromKeyboard 状态：
- 可信方向键、PageUp/PageDown、Home/End 的 keydown 标记键盘归属。
- 新 pointerdown、pointercancel 清除键盘归属，保留之前的指针取消和旧手势防护。
- range change 保持原有的真实媒体 seek 提交流程，但只有非键盘提交才执行 fullSeek.blur()。
- Escape 取消规则仍在原有业务路径，且会清除键盘归属。

没有引入定时轮询、额外延迟、重复音频实例或新增媒体解析请求。

## 四、修复后真实 Firefox/WebKit 证据

在本地和 Edge 两套 CI，每个引擎均确认：
- 八组单键与反向方向键测试：8/8，均基于最后一次 OS seek 的真实音频位置。
- 旧指针继续移动和释放不会覆盖 OS seek。
- 连续 6 个可信 keyboard.down：修复前只有一次 setter 写入，修复后每个引擎均为 6 次。
- 同一滑块连续 4 次可信独立 ArrowRight：四次 setter delta 均为 1，focused 始终 true，不需要重新调用 focus()。
- A→B 换曲后旧 A 指针不会覆盖 B；B 第一次键盘操作基于真实 B 媒体时间。
- 沉浸式 DOM 节点 69→69；单一 audio；A、B 选曲解析调用从 1→2。
- 使用实际原创 MP3 进行浏览器解码，非模拟媒体时钟。
- Firefox 可实际请求 HTTP 206；WebKit 可实际请求 200 及后续 206。另单独确认 RFC7233 Range=bytes=0-31 返回 206 和 32 字节。

最终日志包含：
- FYMUSIC_PHASE40_REPEAT_firefox：writesDelta=6，4.59秒→4.77秒。
- FYMUSIC_PHASE40_REPEAT_webkit：writesDelta=6，约4.596秒→4.776秒。
- FYMUSIC_PHASE40_CONSECUTIVE_KEY_firefox/webkit：i=0..3，writesDelta=1，focused=true。
- FYMUSIC_PHASE40_CROSS_BROWSER_KEYBOARD_PASS_firefox
- FYMUSIC_PHASE40_CROSS_BROWSER_KEYBOARD_PASS_webkit

## 五、最终 CI（包含真实失败历史）

| 环境 | Actions Run | 最终结果 |
|---|---|---|
| 本地隔离 Cloudflare Pages、Firefox/WebKit/Chromium 全回归 | https://github.com/lxhlw/Only-testing-online-music/actions/runs/41483024479 | attempt 1，completed/success，52 个成功步骤，1 个失败专用日志步骤 skipped |
| Edge 独立 Preview、Firefox/WebKit/Chromium 全回归 | https://github.com/lxhlw/Only-testing-online-music/actions/runs/41483024487 | attempt 2，completed/success，51 个成功步骤 |

两套运行使用相同已修复播放器 SHA：7191d1d47ed2cfdd46eddc84835084cb9e50cc8f。

不能隐去 Edge 第一次尝试的失败：Run 41483024487 attempt 1，旧的 synthetic 前后台生命周期测试 test-fymusic-foreground-lifecycle-browser.mjs 在断言 “foreground should restore status class” 时失败。不能仅凭一次失败确定与键盘源码相关。未改播放器代码，直接通过 GitHub 的 rerun failed jobs 再跑相同 commit；attempt 2 前后台专项出现 FYMUSIC_FOREGROUND_LIFECYCLE_PASS，全套 51 个步骤成功。

测试早期还发生两个测试脚本问题，已修复且保留记录：
- Run 41480222651 / 41480222613：错误假设测试 MP3 必然约 12 秒，实际上返回约 30 秒；改为读取真实 duration。
- Run 41480477931 / 41480477776：最后输出诊断引用了错误变量名；修正后 Run 41480829029 / 41480829202 双完整 CI 成功，但当时尚未增加连续键盘严格断言。

Edge 最终成功的隔离非生产 Preview：
https://2521ff3a.only-testing-online-music.pages.dev

Edge 防误部署保护：
FYMUSIC_PREVIEW_GUARD_PASS production_branch=main

生产 main 仍为 c9a496ab580fb54775721b93a3944800bcaefc44，未修改和部署。

## 六、边界及 Phase41 推荐

- 测试使用 Playwright 真正浏览器的可信键盘事件、原生 range 与真实原创 MP3 解码；并非所有物理键盘系统级自动重复速率测试。
- Firefox/WebKit 引擎测试成功不等于全部真实 iOS Safari 手机锁屏和音频焦点已覆盖。
- 受控 MP3 能播放不等于野花/酷狗所有第三方真实歌曲全部可播。用户此前明确暂缓酷狗，不擅自恢复。
- 不再适配 Android 4.4.2。
- Phase41 优先补充上次 Edge synthetic 前后台恢复偶发失败的状态轨迹及复现条件，检查事件顺序、UI 恢复是否真正有竞态。先诊断，再决定是否修改业务源码；不得靠固定 sleep 掩盖。
- 其次补充连续键盘、OS seek、Escape、原生 pointer/touch 与页面失焦交错的有界测试，保持流畅现代 Web 及单音频实例。
- 每轮继续本地完整 CI + Cloudflare 隔离 Preview 全量回归，生产 main 需明确用户授权才可部署。

**下次用户说“下一步”，从 Phase41 继续，并先核对最新 GitHub HEAD，不重复 Phase31–40 已完成工作。**
