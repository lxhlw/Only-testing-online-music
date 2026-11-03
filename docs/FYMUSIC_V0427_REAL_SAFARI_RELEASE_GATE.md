# FyMusic v0.4.27 — 真实 Safari / iOS 发布前验收

状态：**尚未通过实体设备验收，生产发布未获授权**（2026-11-03）。

## 当前发布物

- 独立发布候选分支：`release/fymusic-v0.4.27-rc`，固定 SHA `ae562ef8ce1c22d85326bfe5a150c1cb38f2ab8b`
- 草稿 PR（未合并）：https://github.com/lxhlw/Only-testing-online-music/pull/107
- 正式主分支基线：`main` = `c9a496ab580fb54775721b93a3944800bcaefc44`，版本 `v0.4.26`
- **已验证的线上非生产预览地址**：https://15a05aee.only-testing-online-music.pages.dev （v0.4.27；独立发布 SHA `ae562ef8ce1c22d85326bfe5a150c1cb38f2ab8b`）
- **预览 CI 已成功**：https://github.com/lxhlw/Only-testing-online-music/actions/runs/41576029509 ，16 个步骤成功；包含 Cloudflare 生产分支主分支保护、远程 Pages 版本与资源检查、完整 Chromium 现代网页回归，以及真实 Playwright WebKit 的 390px 视口页面 smoke。此项不是实际 Safari/iOS 硬件验收。
- 线上非生产预览专用工作流：https://github.com/lxhlw/Only-testing-online-music/actions/workflows/fymusic-v0427-release-preview.yml 。上述 URL 取自实际成功运行的 `FYMUSIC_V0427_SAFE_PREVIEW_URL` 日志。
- WebKit 长帧问题：https://github.com/lxhlw/Only-testing-online-music/issues/106

## 实机验收步骤（由真实设备执行）

在 Safari on iPhone/iPad 或 Mac Safari 真机运行，记录设备型号、系统版本、Safari 版本、网络状况与是否省电模式。用无痕窗口打开**经过 CI 验证的独立预览地址**，而非正式 `only-testing-online-music.pages.dev`。

1. **冷启动**：全新无痕页面首次打开；观察首屏和首次点击是否长时间白屏、卡住或延迟响应。记录任何肉眼可见的停顿位置与屏幕录像，若出现超过约 100ms 的重复明显卡顿应复测并以 Performance Timeline 辨别渲染与主线程任务；不要从 headless Playwright RAF 单独推断真机 FPS。
2. **列表与页面动画**：实际搜索/浏览多条音乐、连续滚动、切换页面、打开/关闭歌词详情；检查滚动连续性、触摸事件、UI 遮挡与返回焦点。用 Safari Web Inspector 的 Timeline/Rendering（如可用）捕获首次列表替换、首次详情打开的图表。
3. **音频真实性**：选择授权访问或实际可用的播放源，验证 `HTMLAudioElement` 确实持续推进播放进度，暂停/继续/Seek 是否和进度一致。此前指定的真实歌曲为孙燕姿《开始懂了》；若上游源无法提供这首歌，报告为“音源不可用”，**不可当作真实播放通过**，也不可用伪造时钟替代。不要强制降至 128 kbps。
4. **系统与前后台**：播放时锁屏、切出 Safari 后返回，尝试系统媒体暂停/继续、跳进度、换曲（设备支持时）；确认不会出现双音频、旧歌封面错误或进度条长时间不可操作。
5. **持续使用与恢复**：播放多首歌、重复打开/关闭歌词和滚动列表，然后切前台；观察内存或页面强制重新加载、动画卡顿与异常弹窗。
6. **隐私与合规**：截图或性能日志前隐藏 URL 中的源 token、header、签名、音乐 IDs 或任何私人信息。Issue #106 只需日志摘要和无敏感信息的屏幕录像。

## 通过判定

- 真机页面可进入、基本互动连贯，无可稳定复现的首次交互卡住或持续动画丢帧；
- 使用**真实媒体**的播放、拖动 Seek、切歌、前后台和系统控制行为正确；
- 若仍有异常，提供可复现环境与最小步骤，Issue #106 保持开放；
- 明确标识“实体设备实测通过”还是“仅 headless CI 通过”。后者不足以解除真机性能门槛。

## 生产发布必须另外批准

即便所有实机验收通过，仍不得自行合并 PR #107 或触发 `main` 的发布工作流。先记录生产现有 `main` SHA、最近成功的 Cloudflare Pages 生产 deployment ID 和回滚方案；经用户**明确批准生产发布**后，才能解锁合并、部署与线上监控。发生回归时需受控 revert/恢复历史成功部署并重新验证，不能强制改写 main 历史。

## 剩余多少步？

按此前商定的“主要阶段”口径，**只剩 1 个最终发布阶段**：真实设备验收（当前仍需用户实机或可信真机实验室）→明确生产上线批准→受控上线与回滚验证。CI 或预览成功不会缩减这些必要门槛，也不会额外制造无上限的新开发阶段。
