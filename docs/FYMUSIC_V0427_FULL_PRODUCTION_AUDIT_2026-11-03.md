# FyMusic v0.4.27 正式生产项目审计报告（只读）

审计日期：2026-11-03（Asia/Singapore）  
生产 URL：https://only-testing-online-music.pages.dev  
唯一受审核生产提交：`586f592dc994b0868886bcb42b1213c3580f278b`。  
审计过程中 **没有修改 `main`、Cloudflare 生产部署或用户数据**。全部新增审计辅助工具和本文仅在 `feature/fymusic-playback-verifier`。

## 审计方式、证据、边界

- GitHub API 直接检查 main 树、源码、9 个正式工作流、合并 PR #107 和已发布流水线；main 树不截断，共 192 个版本控制文件（src 26、Functions 13、Actions 9、scripts 117、android-companion 18）。
- 生产构建：PR #107 合并至 `586f592...`；[正式发布 run #41582700309](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41582700309) completed/success，Cloudflare immutable deployment `https://eaa30bfb.only-testing-online-music.pages.dev/`，线上版本元数据 0.4.27。
- [真实生产音源复测 #41583531444](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41583531444) completed/success；纠正了旧版明文音源 URL 断言后，酷我、咪咕各 2/2，音频真实播放、Seek 后继续推进及咪咕 25 秒后继续播放。
- [只读生产 HTTP/精确文件校验 #41587268388](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41587268388)：**20/20** 文件 SHA-256 与生产 main 完全一致（`index.html`、`settings.html` 的规范化 308 跳转已正确跟随）；**7/7** 安全拒绝请求符合预期（空目标、localhost、127.0.0.1、[::1]、file:、异源 Origin、跨站 Fetch Metadata）。
- [只读跨引擎生产浏览器审计 #41587588153](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41587588153) completed/success：Chromium / Firefox / WebKit，分别跑 1366×900 桌面及 390×844 移动视口，共 **6/6** 无 JS pageerror、无第一方核心资源错误、仅一个 audio、无页面横向溢出；每个浏览器 36 次×180 行列表更新和 3 次歌词弹层交互全部通过。
- [准确锁定生产 SHA 的依赖审计 #41587979228](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41587979228) completed/success；`npm audit --json` 对正式 main 的 102 个安装包返回 4 个 high、0 critical（npm audit exit 1，审计 CI 信息性记录而非自动修复）。这些依赖位于 `devDependencies` / 工具链，不代表已实际在浏览器运行。
- 仅做有界、非破坏性线上请求和源代码检查。**不等于渗透测试、真实 Safari/iOS 设备 FPS 验证、全世界各地区音源覆盖或凭据安全认证。** 没有修改正式站。

## 生产运行与播放：已验证合格

1. 生产版本、页面、核心 JS/CSS 全部与所批准 commit 一致。线上 `version.json`：FyMusic 0.4.27。
2. 核心应用、列表/歌词、播放器 UI 和本地曲库、响应式布局能够在上述浏览器引擎中初始化、交互，无本次测试可复现的页面异常。
3. 真实生产 Flower 酷我和咪咕两轮测试分别 2/2 通过；不把自动化测试音频等同于《开始懂了》或其他所有第三方版权曲库的可用性。
4. 播放音质配置默认为 `qualityMode: highest`，固定品质支持 320k 等等级，存在显式回退逻辑，未发现强制全站上限 128k 的配置。
5. `src/modern-ui.js` 将一部分 DOM 状态刷新合并到 rAF；`modern.css` / `mobile-shell.css` 有 reduced-motion 配置，表明项目有性能与动效兼顾的设计。
6. 首页安全响应头至少有 `X-Content-Type-Options: nosniff` 和 `Referrer-Policy: strict-origin-when-cross-origin`，代理对私有 IP、跨站请求等有防护。

## 生产运行性能样本（仅 Linux GitHub Actions headless）

| 浏览器与视口 | FCP | DOMContentLoaded | RAF p95 | RAF max |
|---|---:|---:|---:|---:|
| Chromium 桌面 | 260ms | 341ms | 16.8ms | 16.8ms |
| Chromium 390px | 228ms | 317ms | 16.7ms | 16.8ms |
| Firefox 桌面 | 431ms | 527ms | 17.1ms | 17.1ms |
| Firefox 390px | 190ms | 250ms | 17.1ms | 17.1ms |
| WebKit 桌面 | 420ms | 622ms | 17ms | **199ms** |
| WebKit 390px | 262ms | 395ms | 17ms | **196ms** |

- 每个页面约 20 个 script 标签、27–28 个浏览器资源请求；服务器实际字节传输受资源计时器和缓存影响，不能把汇总当真实终端流量。
- 生产浏览器 DOM 压力测试中 WebKit 最大帧间隔 86ms；先前候选预览测试最大达到 205ms。**WebKit 偶发长帧仍需跟踪 [Issue #106](https://github.com/lxhlw/Only-testing-online-music/issues/106)**，不能保证实体 iPhone/iPad 无卡顿。
- 这不是慢速 4G/低端设备采样，不能据此宣称真实设备全程 60/120FPS。

## 发现与等级（高优先级不等于已发生攻击）

### P1-A：运行不可信 LX 音源脚本的安全边界不足

`src/source-manager.js:248-309` 使用 `new Function(...executionCode)`，通过 `global` 主窗口运行源自网络或用户自定义 URL 的完整脚本，能访问主站的 DOM、localStorage 和同源 API；默认来源指向可随时变化的 `flower/latest.js`。这是实现 LX 自定义音源功能的既有架构，但属于高信任、高影响攻击面。建议支持可信源清单/哈希固定与更新审批，分离解析工作执行域（sandboxed iframe/Worker + 能力约束消息协议），降低第三方脚本被篡改时对本站数据的权限。

### P1-B：公用代理防护仅覆盖部分滥用情况

`functions/api/proxy.js:651-741,987-1110` 实现了私有地址过滤、3 次重定向逐跳检查、浏览器 Origin / Fetch Metadata 限制，7 项线上负面测试通过。不过 `validateProxyTarget` 并未限定到音乐提供商域名；请求无 Origin、无 Fetch Metadata 时仍被允许（兼容旧客户端），任何可访问的公开 HTTP(S) 主机原则上均可能被当作通用代理目标；应用代码中也未看到明确的单客户端配额/流量上限或全站速率限制。建议以支持的音源域名单/按来源签发的能力令牌收窄范围、配置 Cloudflare WAF/Rate Limiting、请求方法与响应大小及并发预算限制，并保留现有 Range/Seek 支持。**不声称已证实内网 SSRF；DNS 解析/WAF 的平台限制没有直接测试。**

### P1-C：生产分支和手动部署缺少强制门禁

GitHub API 显示 `main.protected=false`、仓库规则集为空（专属保护 API 当前连接为 403，不能读取其他组织级规则）。`.github/workflows/verify-and-deploy.yml` 的 `workflow_dispatch` 生产部署 job 没有显示明确的 `github.ref=='refs/heads/main'` 限制，且 `push main` 触发自动生产部署。建议设置强制 PR 审核/状态检查、禁止直接 push、限制手动部署只能从正式分支且仅经过批准的 SHA，并锁定生产 environment 权限。**不能据此断言未经授权人员当前可以部署。**

### P1-D：正式生产 SHA 的依赖审计发现 4 项 High

版本 `0.4.27`、`main SHA 586f592...`、102 个安装包：`wrangler`（直接 devDependency）、`miniflare`、`undici`、`sharp`（传递依赖），4 high，0 critical；扫描报告列出的项目均有可用修复。它们属于 **CI/构建/部署工具链**，不能直接认定终端播放应用本身带同样漏洞。仓库没有 `package-lock.json`，9 个工作流中的发布流程仍使用 `npm install`，导致构建依赖不可完全复现。建议受控升级工具链、生成/提交 lockfile，CI 改 `npm ci`，运行原有全部发布回归后再切换正式构建，不要盲目 `npm audit fix`。

### P2-A：生产 HTTP 安全响应头尚不完整

实际正式首页缺 `Content-Security-Policy`、`Strict-Transport-Security`、`Permissions-Policy`、`X-Frame-Options`；反之已有 `nosniff`、`Referrer-Policy`。仓库没有 `_headers`。应优先增加能安全启用的页面防嵌套和权限头；严格 CSP 需要同步重构 `new Function` 和内联 JS/onclick，否则会误伤功能。HSTS 需要确认 HTTPS 和域名策略后启用。

### P2-B：部署公开目录范围过宽

线上直接返回 HTTP 200，且字节内容与 GitHub main 一致：
- `/README.md`
- `/package.json`
- `/scripts/test-modern-web-browser.mjs`
- `/android-companion/README.md`
- `/.github/workflows/verify-and-deploy.yml`

当前仓库本身是公开的，因此这些路径并不构成新的私密代码泄露；但正式 Pages 从仓库根目录部署，使内部文件额外成为网站资产，增加可被探测表面、部署体积和维护噪声。`/api/audio-selftest` 也作为有效音频测试端点开放。建议创建**精确的发布产物清单**，只打包运行必需的前端/Functions/静态素材；先核查是否有测试依赖再移除旧诊断端点，避免影响生产音频播放。

### P2-C：发布 CI 中的旧真实音频诊断存在已确认假阴性

原 `scripts/test-flower-ui-stability-live.mjs` 要求记录明文 `__debugRequests[].url`，但 v0.4.27 安全改动已脱敏此字段，所以正式发布日志中酷我/咪咕 0/4 是**诊断逻辑假阴性**。开发分支已把断言改为只检查安全分类与代理标志，独立真实生产复测 4/4 通过；**该修订尚未进入 main**。原发布工作流还将多个上游测试设置为 `continue-on-error: true`，会让工作流整体绿灯掩盖个别音源诊断失败。建议下一版把修正版测试与关键音源可用性阈值纳入必选发布门槛，其他不稳定外部通道独立作为可见的警告结果。

### P2-D：偶发 WebKit 长帧与实机可观测性不足

Linux Playwright WebKit 产生约 196–199ms 单次帧间隔，历史测试还有长帧/缓冲时序异常；Issue #106 未关闭。用户口头验收了实际测试，但目前没有真实 Safari 设备帧率/资源追踪的可审计记录。建议按冷启动/持续滚动/歌词弹层/进度条拖动分场景测量，在收集重现证据前不要盲目修改渲染或媒体状态代码。

### P3：工程清理与可维护性

- `README.md` 仍自称面向 Android 4.4，使用旧的《成都》场景，与现代纯 Web、FyMusic 命名和《开始懂了》目标不一致。
- `android-companion/`、早期兼容探针、`legacy-audio`、`audio-selftest`、ES5 分支仍在正式源码中；用户已取消 Android 4.4 支持需求，应在独立清理提交中逐项删除未被现代路径引用的代码，避免误删仍共用的音源函数。
- 主要前端 `src/app.js`≈135KB、`src/music-search.js`≈131KB；当前约 20 个 script 标签、三份 CSS，具备拆分、懒加载与精简静态产物空间。是否真正影响手机速度需复测再优化。
- `src/music-library.js` 把播放队列、最近历史及收藏保存在 localStorage（队列上限 100、历史 300、收藏 200）；本地清理浏览器数据可能导致数据丢失，当前该模块没有导出/跨设备备份 API，建议增加可选本地 JSON 备份/恢复。
- 开放 Issues #9、#92 与 #106 尚需按当前上线事实重新判定是否仍可重现；不要凭历史标题直接视为当前生产故障。

## 建议执行顺序

**阶段一：仅发布工程/安全门禁，避免播放器行为回归。**
1. 保护 main、锁定 workflow_dispatch 的生产来源与 SHA、加 Cloudflare 环境审核；保留 v0.4.26 回滚。
2. 在单独 PR 修复 4 项 npm high 工具链依赖、提交 lockfile、切换 `npm ci`；全量 CI + 预览站对比。
3. 同步提交被主分支遗漏的脱敏 Flower 诊断修复，发布工作流明确区分关键失败与可容忍的上游波动。
4. 建立最小产物部署与安全响应头策略，优先不影响实际音乐解析与当前 JS 执行。

**阶段二：高风险业务边界逐步加固。**
5. 为自定义 LX 源执行引入可信脚本来源/完整性校验和隔离设计；先通过独立预览验证，不要直接改生产。
6. 精确收窄代理目标能力、来源预算和限流，并验证下载、Range 206、Seek、质量切换、同一首歌跨源能力。

**阶段三：在基线稳定后做性能和功能清理。**
7. 基于真实 Safari 设备追踪修复 #106；整理遗留 Android 4.4 代码，更新 README、导出本地曲库、按需拆分 CSS/JS。
8. 对 `孙燕姿《开始懂了》` 做源平台和选定音质的真实设备样本记录；不把任何单一来源的通过结果推广到全部平台。

## 总结

**当前无证据需要立即回滚 v0.4.27**：已审核的生产代码、部署、关键浏览器测试与酷我/咪咕复测均通过。  
但**安全与发布工程不能视为完成**：存在依赖 4 个 High、未保护 main、第三方脚本同域执行、代理用途约束过宽、网页缺完整安全头、公开产物过宽和 CI 假阴性。建议优先做安全/工程治理的 v0.4.28，而非堆叠新播放功能。

本报告是静态审计 + GitHub-hosted 生产浏览器/HTTP 实测，不包含 Cloudflare 隐藏 WAF 配置审计、完整授权渗透测试、第三方服务地区覆盖或真实硬件 FPS 证明。
