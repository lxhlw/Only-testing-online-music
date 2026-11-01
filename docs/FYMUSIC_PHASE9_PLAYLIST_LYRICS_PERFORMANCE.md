# FyMusic Phase 9 — Playlist pagination, long lyrics and smooth-scroll correctness

日期：2026-11-01（Asia/Singapore）

## 项目约束

- 只更新 `feature/fymusic-playback-verifier` 开发分支和隔离 Cloudflare Pages Preview，不合并或部署 `main`。
- 按用户明确要求，本阶段不调查酷狗上游 404/403/502；未修改 Flower 源脚本、源选择、跨平台播放规则、音质设置或正式生产部署。
- Web 优先：针对大量歌曲、歌词和高频 UI 事件优化，不再进行 Android 4.4.2 适配。
- 现有实歌验收目标仍为孙燕姿《开始懂了》；以下列表/歌词压力测试均为**受控合成数据**，不冒称真实在线音乐解析或音频品质验证。

## 改进 1：长歌词定位由 O(n) 改为 O(log n)

文件：`src/music-lyrics.js`，Commit `ef8b6b69f9b533adf96ac51ad127c86b84e52cf0`。

- `parseLrc` 已按时间戳排序，故 `getActiveLine` 采用二分查找最后一个 `time <= currentTime` 的歌词行。
- 保留同一时间戳多句歌词时选择最后一行、负数进度视为 0 秒的旧行为。
- 在 65,536 行合成歌词中，最多只读取 17 次行时间戳（验证的是算法访问次数，不是用户设备上的绝对时间）。

## 改进 2：列表动画只处理最新追加行

文件：`src/modern-ui.js`，Commit `f7e7f6a4f41811717e6e324c33e9ea58ce268d9d`。

- 旧版 MutationObserver 每次都看列表前 12 行，新分页追加到第 700 行之后就不再给新行产生动画。
- 新版从 `MutationRecord.addedNodes` 获取本次新增的直属行，加入同帧待办 Set；只动画本批次**最多 12 行**，避免 250 行一起启动动画或每次重复扫描整张列表。
- 仍保留 `animationend` 清理和系统的 reduced-motion 样式，不增加轮询计时器。

## 改进 3：连续歌词变化只居中最后的活动行

文件：`src/now-playing-experience.js`，Commit `c1d967ac1c273e95d128159368f1680bdc2f748e`。

- 原有歌词 MutationObserver 在不同时间收到大量活动行变化时可能不断入队 `requestAnimationFrame` 和重叠平滑滚动。
- `scheduleLyricCenter` 总是先取消已有尚未执行的帧，然后安排最新活动行居中，每帧至多进行一次。
- 在切歌、切换到评论页、关闭沉浸式歌词页时 `cancelLyricCenter`，防止上一首歌词过期滚动影响新歌曲。
- 沉浸式页面关闭时依旧不进行隐藏播放器 DOM 进度写入。

## 改进 4：真实歌单页面从整表重建改为增量追加

文件：`index.html`，Commit `36c63d8026190c19ce30ca51fd7be396fd078e62`。

- 旧版加载任何下一页时都运行 `host.innerHTML=''`，并把此前全部歌曲重新创建 DOM、事件监听和按钮，容易造成大量列表的滚动卡顿、焦点丢失。
- 现在 `renderPlaylistSongs(list,fromIndex)` 根据此前实际行数只创建新页行；原行的 DOM 对象、键盘焦点、正在播放标记和事件处理保留。
- 若当前 DOM 行数与预期不符，则安全退回完整渲染（避免打开不同歌单或页面状态异常时追加到错误列表）。
- 保留分页 `generation` 防过期回调、防重复歌曲、每行实际歌曲索引、播放/加入队列/收藏操作和高亮功能。未改第三方歌单 API。

## 自动化与真实隔离 Preview

### 压力回归：合成 950 行与高频歌词

`scripts/test-fymusic-long-list-lyrics-browser.mjs`，Commit `24a89c13d1171fa1c8e9dd002e69b09e55662b05`；边界测试预期修正 `4bf2678c8e53589e5f8e1f51190375ab502a2022`。

- 初始 700 行，仅 12 行安排动画；再追加 250 行，只有新页的 12 行安排动画；旧 700 行保留。
- 65,536 行歌词二分查找最多 17 次索引，重复时间戳语义保持。
- 快速连续推进 84 次活动歌词，仅进行一次待绘制的居中任务；切歌并关闭弹层后无过期滚动。
- 第一次 CI 因**测试预期自身错误**失败：负数播放时间在原始播放器语义中正规化为 0，测试却预期 -1。修正后，完整回归成功；未因此修改播放器的负数时间行为。

### 真实歌单 UI 增量与键盘测试

`scripts/test-fymusic-playlist-incremental-browser.mjs`，Commit `de21f8619267dff35a1edd3a395f8d6280dd9c8e`。

- 使用 Playwright 截获的受控合成歌单（2 页、每页 50 首），验证点击“我的音乐 → 歌单收藏 → 打开歌单”的真实页面操作。
- 固定第一首的 DOM 节点并赋予焦点，加载第 2 页后检查同一节点仍在文档中、焦点保留、新歌曲索引为 50–99。
- 验证恰好两次歌单 API 交互、没有额外分页请求、仅对最新 12 行安排动画，不触碰第三方在线歌曲。

### 已通过 CI

- [本地 Pages 全浏览器回归 Run 41273875817](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41273875817)：**completed/success**。包含 `FYMUSIC_LONG_LIST_LYRIC_STRESS_PASS`、`FYMUSIC_PLAYLIST_INCREMENTAL_BROWSER_PASS`、既有界面同帧同步、签名请求脱敏及显式 KW 备用受控回归。
- [Cloudflare Edge UI-only Preview Run 41273880111](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41273880111)：**completed/success**。安全检查确认 `production_branch=main`；实际隔离 Edge 预览执行两种新浏览器压力回归均成功。
- 最新 Edge Preview：https://6a0ed9eb.only-testing-online-music.pages.dev
- 本次单次 GitHub Chromium：First Contentful Paint ~236ms，DOMContentLoaded ~327ms，直接可采样的 first-party/vendor CPU ~22ms。**这是单次 CI 样本，不能宣称所有设备达到 60 FPS、或性能相对上一版本提高特定百分比。**

## 保留的限制与后续方向

- 歌单新增页已避免重建旧歌曲，但进入一份已有 1000 首歌曲的歌单仍会创建对应 DOM；未来可在真实大规模数据下评估窗口化渲染，不要在未有证据时增加滚动复杂性或影响屏幕阅读器。
- 下一步可进一步检查低端现代手机的长列表滚动帧率、键盘焦点和屏幕阅读器、移动端视觉回归，同时保留播放业务回归。
- 野花远端可用性与 FLAC/320k 实际编码核验不属于本阶段完成范围，不能宣称已解决。
- 正式 `main` 仍保持原生产 HEAD；用户授权前不合并或发布到生产。
