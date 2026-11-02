# FyMusic Phase39 — Firefox/WebKit 交错操作压力测试与过期拖动键盘误跳转修复

**日期：2026-11-02（Asia/Singapore）**  
**仓库：** https://github.com/lxhlw/Only-testing-online-music  
**开发分支：** `feature/fymusic-playback-verifier`  
**Phase38 交接基线：** `f7884e23f3e7e76343d68629a6cb8a558a8eba08`  
**Phase39 新增测试与工作流：** `56aa6c490169ed97a60e10321d15c8b739525791`  
**Phase39 正式源码修复：** `ebb538fab73d25a701dd8237715e08d2c34537ff`  
**生产 main HEAD：** `c9a496ab580fb54775721b93a3944800bcaefc44`，本阶段未修改、未合并、未部署生产。

## 一、阶段结果

**Phase39 已完成。Firefox 和 WebKit 原生鼠标/键盘归属压力测试、全部历史 Chromium 和 Edge 网络/格式/UI 回归，在两套 CI 上均 completed/success。**

新增 `scripts/test-fymusic-phase39-cross-engine-stress.mjs`，分别在 Playwright Firefox 与 WebKit 上执行。两个环境分别是本地隔离 Cloudflare Pages 服务，以及正式 Cloudflare Edge 的独立非生产 Preview。

承接 Phase38 已实现的真实歌曲搜索、A/B 选曲、原生 audio、实际原创 MP3 解码、浏览器生成的可信鼠标/键盘事件及用真实原生 currentTime 透明 getter/setter 记录 seek 写入。仅测试媒体解析器和 Media Session handler registration 在 QA 环境受控，不模拟音频播放时钟、不生成假音频事件、不请求第三方真实歌曲。

## 二、真正的新问题与复现

Phase38 确认了“OS seek 覆盖旧拖动”以及“取消旧拖动后键盘仍能操作”，但此前只验证新键盘操作发生了变化，没有验证变化是不是**基于最新真实音频时间**。

Phase39 加入严格测试：旧鼠标按住沉浸式滑块移动至约 86%，Media Session 将原生音频时间设置为 3 秒；旧鼠标继续移动并松开，被禁止覆盖系统跳转；随后用户在滑块上按一次 ArrowRight。

**未修复时真实 Firefox 日志：**
- OS seek 后 `audio.currentTime=3` 秒，当前写入仅为 `[3]`。
- 旧原生指针结束后，range DOM 的 value 仍可停留在旧约 960/1000（滑块的旧位置），虽然 seek 没有被提交。
- 新键盘 ArrowRight 会在这个旧滑块值上继续增加，导致 `audio.currentTime=28.83` 秒，`writes:[3,28.83]`。
- 复现 Edge Run [41392227207](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41392227207) 和本地 Run [41392227238](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41392227238)，其失败正是新增的“键盘调整必须从 3 秒附近继续”的严格断言。

根因：Phase35/36 的 `abandonedTouchGesture` 正确拦截旧滑块的真实提交，但浏览器对 range 控件的内部 value 修改不会因拒绝提交自动撤回。Phase38 键盘 handler 将 `abandonedTouchGesture=false` 并允许新键盘默认动作，却没有在这个新动作执行前先把 range 值复位至真实 `audio.currentTime`。因此旧指针虽无权提交，**其遗留的 UI 值仍能影响下一次合法键盘操作**。

## 三、最小源码修复

修复提交：[ebb538fa](https://github.com/lxhlw/Only-testing-online-music/commit/ebb538fab73d25a701dd8237715e08d2c34537ff)。

文件：`src/now-playing-experience.js` 的 `#detail-seek` 键盘处理：

```js
if(event.isTrusted&&event.key!=='Escape'&&document.hasFocus()){
  // A cancelled physical drag may have changed the native range thumb
  // without committing the audio. Restore the *real* currentTime before
  // the browser applies this new keyboard step, or ArrowRight would jump
  // from the abandoned thumb instead of the OS's latest seek position.
  if(abandonedTouchGesture)updateTransport();
  abandonedTouchGesture=false;
  ignoreCancelledSeekChange=false;
}
```

`updateTransport()` 在 `seekPreview=false` 时，使用当前真实原生 audio.currentTime/audio.duration 将滑块恢复至真实时间。只在存在已废弃操作、且用户确实触发受信任的新键盘动作时执行；不增加连续循环、定时轮询、额外媒体请求或 audio 元素。保持 Escape 取消与按钮焦点处理的原有逻辑。

## 四、12 轮高频交错压力及资源观测

压力脚本在 B 曲真实解码、暂停状态下，重复 12 轮以下操作：

1. 浏览器原生鼠标按住并拖动，显示真实预览。
2. Media Session 注册的 seekto handler 将媒体设置到 `1.25+(i%8)*0.38` 秒。
3. 旧鼠标继续移动再松开，确认它不会产生额外的 seek 写入，真实媒体位置仍属于最后一次 OS 指令。
4. 在原滑块上触发可信 ArrowRight，断言实际媒体只新增一次写入，而且新位置基于当前 OS 位置，不能从旧预览位置跳走。
5. 记录音频位置、写入次数；整个过程不刷新页面、不重新选择歌曲或重建播放器。

两引擎在本地/Edge 的日志基本一致，包含：
- 首轮 OS 约 `1.25` 秒，旧指针结束后约 `1.26` 秒（允许浏览器媒体时间粒度差异），下一键盘跳至约 `1.29` 秒。
- 第 12 轮 OS `2.39` 秒，旧指针结束后约 `2.4` 秒，下一键盘约 `2.43` 秒。
- 每组 12 轮完成后的可记录 native setter 写入总数为 27，未发现旧触摸的额外提交。
- 沉浸式 overlay 内元素数量始终为 **69 → 69**；同一个原生 `audio` 元素（1 → 1）；音源解析总数为 A/B 两次（2 → 2），不切换歌曲、平台和所选质量。
- 事件诊断历史有限长（最多 90），避免 QA 事件数组无界增长。

**资源边界：** 这里统计了 DOM 节点、单 audio、解析器调用数与有界诊断记录；它不是进程 RSS/JS heap 长时间分析，也不能由此推出实体浏览器设备上的长期内存完全稳定。WebKit 原生播放与大量 seek 可能合法触发额外 Range 请求，不能把 `resolvers=2` 解读为“没有任何后续网络媒体请求”。本次没有做实体设备的 FPS 或 CPU 精确性能对比。

## 五、最终真实 CI 证据

| 环境 | GitHub Actions | 结果 |
|---|---|---|
| 本地隔离 Chromium 服务，附 Firefox 和 WebKit QA | [41392437051](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41392437051) | **completed/success，52 步，首次运行** |
| Cloudflare Edge 独立 Preview，附 Firefox 和 WebKit QA | [41392437019](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41392437019) | **completed/success，50 步，首次运行** |

修复后最关键的重新测试：
- Firefox：`FYMUSIC_PHASE39_KEYBOARD_firefox` 显示 `3 → 3.03` 秒，write 数由 1 变 2。
- WebKit：`FYMUSIC_PHASE39_KEYBOARD_webkit` 显示约 `3.004 → 3.034` 秒，write 数由 1 变 2。
- `FYMUSIC_PHASE39_CROSS_ENGINE_STRESS_firefox` 和 `..._webkit` 都记录 12 轮压力，资源快照中 `nodes:69`、`audio:1`、`resolverCount:2` 前后不变。
- 两套 CI 均出现 `FYMUSIC_PHASE39_CROSS_BROWSER_STRESS_PASS_firefox` 及 `..._webkit`。
- Phase38、37、36、35、34、33、32、31 与完整原生音频、HTTP200/206、MSE、MP3/AAC/FLAC、UI 生命周期和启动性能回归全部成功。
- Edge 防止生产部署的工作流检查：`FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`。

**非生产独立预览：** https://27a7830b.only-testing-online-music.pages.dev

## 六、项目约束与 Phase40 建议

现代纯 Web FyMusic；界面动画要求流畅，不通过固定等待/轮询弥补事件竞态；单个原生 audio；用户指定音质不静默降级或未经许可改平台；不再专门适配 Android 4.4.2；生产 `main` 禁止未经授权合并部署。用户此前已要求暂缓酷狗真实音源问题，不擅自恢复测试；受控原创 MP3/FLAC 成功不等于野花/酷狗真实歌曲全部可播。

**Phase40 候选：** 对同一套修复加入可信的反向方向键、Home/End、PageUp/PageDown 和连续键盘按住的跨浏览器检查（注意不同浏览器的 HTML range 步长差异），尤其检查在 OS/换曲/后台取消旧手势后，第一次键盘操作总是从最新音频时间开始。另可在真实设备具备条件时检查 Safari、Firefox 的手机触控与锁屏路径。先测试、复现，再决定是否修补业务代码。
