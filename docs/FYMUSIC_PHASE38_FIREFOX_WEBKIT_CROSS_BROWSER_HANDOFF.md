# FyMusic Phase38 — Firefox / WebKit 真正浏览器指针与键盘归属验证

**日期：2026-11-02（Asia/Singapore）**  
**仓库：** https://github.com/lxhlw/Only-testing-online-music  
**开发分支：** `feature/fymusic-playback-verifier`  
**Phase37 基线：** `7eb060292cd7a14370bae87badd087c0c8babfd5`  
**Phase38 初始测试提交：** `a90285e038ce259d3e3b7bef49be7b3dca5ba64f`  
**Phase38 最终测试修订：** `417217c4ed2597a584c87d91593780ff61870b01`  
**生产 main：** `c9a496ab580fb54775721b93a3944800bcaefc44`，未修改、未合并、未部署生产。

## 一、阶段结论

**Phase38 完成；本地 Chromium 服务环境和 Cloudflare Edge 独立预览环境的完整 CI 均已成功。** 在每个环境中都运行了真正的 Playwright Firefox 浏览器引擎和 WebKit 浏览器引擎，而不是只在 Chromium 中更换 User-Agent。没有发现新播放器逻辑缺陷，因此本阶段**没有修改业务源码**。

新增测试 `scripts/test-fymusic-phase38-cross-browser-pointer-ownership.mjs`，修改两套工作流 `.github/workflows/fymusic-playback-verifier.yml` 和 `.github/workflows/fymusic-ui-preview.yml`。两个 CI 均执行：

```sh
npx playwright install --with-deps chromium firefox webkit
BROWSER_ENGINE=firefox node scripts/test-fymusic-phase38-cross-browser-pointer-ownership.mjs
BROWSER_ENGINE=webkit node scripts/test-fymusic-phase38-cross-browser-pointer-ownership.mjs
```

## 二、测试范围

- Playwright Firefox 与 WebKit Linux 构建、**桌面视口 1200×850**；通过 Playwright 原生 mouse move/down/up 使浏览器真正派发可信 `pointer/input/change`，通过 keyboard.press('ArrowRight') 测试真实键盘路径。不是合成 DOM `change` 事件。
- 沿用正常 UI 搜索和歌曲选择、真实原生 `audio`、真正浏览器解码；只用测试注册的 Media Session 接口与测试解析器代替外部服务。**这不是物理锁屏按钮或第三方真实音源测试**。
- 音频使用项目原创 MP3 QA fixture `format=mp3`、真实 HTTP 请求和真实播放器时间；配置选中 `320k` 是测试的歌曲请求质量标记，并**不证明该生成的 MP3 fixture 编码码率为 320kbps**，也不暗示任何用户实际音质被降级。正式用户音质固定策略没有修改。
- 透明包裹 `HTMLMediaElement.prototype.currentTime` 原生 getter/setter，仅记录媒体实际跳转写入，不模拟播放时钟。
- 场景一：真实鼠标正在拖动沉浸式进度条，调用已注册的 OS seekto handler 跳到 3 秒，继续旧鼠标操作并松开，证明旧手势不能覆盖已生效的 OS 指令。
- 场景二：旧指针结束后，用新键盘 ArrowRight 真正提交一次。
- 场景三：按住 A 曲进度条时从真实搜索结果切换到 B 曲，暂停 B 后再松开 A 的旧鼠标。验证旧操作不写入 B，音乐标题与 Media Session 元数据均属 B，只有一个 audio。
- 场景四：在 B 曲重新按下鼠标并正常提交，确保被中断的旧指针不会阻止新的合法用户操作。
- 保持 A/B 两次固定音源解析，不改变音源平台或正在播放的歌曲。

## 三、初次失败与准确原因

初始测试提交 `a90285e038ce259d3e3b7bef49be7b3dca5ba64f` 的两套 CI：

- 本地 Run [41390660067](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41390660067)
- Edge Run [41390660185](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41390660185)

均实测 **Firefox 全部专项断言通过**；WebKit 的真实 OS seek、键盘、切歌旧鼠标与新鼠标也已通过，最后仅因测试断言强制浏览器媒体请求必须返回 **HTTP 206** 失败。

这是假设错误：浏览器可以合法选择不带 Range 的全文件 HTTP 200 请求。媒体 200 与媒体 206 都可以是有效的成功加载；不能把服务端支持 HTTP 206 等同于各个浏览器必须使用它。WebKit 的 native time 实际已正常推进。

修订 `417217c4ed2597a584c87d91593780ff61870b01` 改为同时要求：

1. 每首音乐在浏览器的原生音频网络事件中至少有一次成功的 HTTP 200 或 206；
2. 使用同一服务实际发送 `Range: bytes=0-31`，必须返回 HTTP 206 且响应体恰为 32 字节；
3. 真实音频解码、指针归属、键盘、歌名、时间写入和单 audio 断言仍严格执行，不能因传输差异跳过。

因此这是**修正测试的传输假设**，不是使用降级、替换音源或规避 WebKit 的失败。

## 四、最终双 CI 与原生日志

| 工作流 | Run | 结果 |
|---|---|---|
| 本地 Chromium 服务 + Firefox 和 WebKit | [41390863754](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41390863754) | **completed/success，51 步，首次运行** |
| Cloudflare Edge 预览 + Firefox 和 WebKit | [41390863798](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41390863798) | **completed/success，49 步，首次运行** |

Firefox 测试记录 A/B 原生 MP3 媒体请求均为 **HTTP 206**。WebKit 的真实请求事件中包含 HTTP 200、206 与状态 0 的记录，但 A/B 均有成功的实际媒体加载，并且两个测试环境独立发送 Range 请求均验证 HTTP 206。**状态 0 的记录不当作加载成功证据**；实际成功依赖 200/206 的响应和成功播放。

本地与 Edge 均出现：

```
FYMUSIC_PHASE38_CROSS_BROWSER_PASS_firefox
FYMUSIC_PHASE38_CROSS_BROWSER_PASS_webkit
```

并且这些标志都包含：`osSeekPrecedence:true`、`keyboardRecovery:true`、`trackOwnerPrecedence:true`、`freshPointerRecovery:true`、`nativeMedia:true`、`range206ServerVerified:true`、`oneAudio:true`。

Cloudflare Edge 日志另有 `FYMUSIC_PREVIEW_GUARD_PASS production_branch=main`，独立预览地址：
https://6a99f0db.only-testing-online-music.pages.dev/

完整工作流继续运行 Phase37 至 Phase31 等前序交互回归、前后台生命周期、实际音频缓存与缓冲、HTTP 200/206、多格式 MP3/AAC/FLAC、歌词/列表和启动性能核查，全部成功。

## 五、范围限制和 Phase39 推荐

Playwright 的 Firefox/WebKit Linux 浏览器引擎和桌面原生鼠标测试 **不等于在实体 iPhone Safari / Windows Firefox / macOS Safari / Android Firefox 中全面测试，也没有测试 WebKit 在真实手机系统锁屏与触摸拖动下的全部手势差异**。Media Session 系统处理器仍为测试注册后的回调调用，非真实系统通知中心。受控 MP3/FLAC 成功不说明野花或酷狗真实歌曲已恢复；用户此前明确暂缓酷狗专项。

仍遵守：FyMusic 现代流畅纯 Web、单个原生 audio、事件驱动无任意延时轮询、不新做 Android 4.4.2 适配、固定选定音质不静默降级、不未经授权切换平台/音源、生产 main 未授权禁止部署。

**下一阶段 Phase39 建议**：完善 Firefox/WebKit 的高频事件交错与资源稳定性验证；新增明确区分服务端 Range 能力、浏览器实际媒体请求、真实解码能力和滑块事件顺序的诊断报告。若可获取实体设备，再做真实 Safari/Firefox 触屏、浏览器后台与锁屏验证。在没有可复现缺陷时，不为了新增阶段而修改已稳定的播放器源码。
