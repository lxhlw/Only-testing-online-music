# FyMusic Phase 7 — Signed-request redaction and live Flower 404→403 evidence

日期：2026-11-01（Asia/Singapore）

## 目标与限制

- 开发分支：`feature/fymusic-playback-verifier`。**不更新生产 `main`**，Cloudflare 仅隔离 Preview。
- 用户指定唯一真实歌曲：孙燕姿《开始懂了》；真实源仍为未修改的 Flower LX 用户脚本。
- 遵守 KG 失败 → 用户主动搜索 KW → 严格候选核对 → 二次确认；不允许暗中跨平台换歌、不允许自动重试。
- 音质不全局强制 128k；高音质必须由真实音源声明支持，并以媒体编码证据验证。
- CI 不能输出任何媒体 URL、原始代理查询、歌曲 ID、Hash、源签名、Cookie、认证头。

## 修复：LX 运行时签名请求调试缓存敏感信息

在 `src/source-manager.js` 的 `makeRequestHandler` 中发现：此前 `runtime.__debugRequests` 每次都保存源脚本原始 URL、所有自定义请求头和已经 URL 编码的 `/api/proxy?url=...`，最多 100 条。这些字段可能携带 Flower 的签名 `tag`、歌曲身份参数或其他凭据。虽然此前未在 CI 中打印，此内存队列本身仍然不应保留敏感数据。

处理：
1. 内存调试快照仅保留 `method`、`proxied` 和白名单 `category`（例如 `flower-resolver`、`flower-script`、`same-origin`、`external`），最多 30 条。
2. **不修改真正的 XHR 请求**：既有 `X-LX-Headers` 和原始脚本签名仍完整透传；不动 LX Desktop Needle 的 HTTP 4xx/5xx `err=null` 语义。
3. 新增受控浏览器回归 `scripts/test-fymusic-runtime-request-privacy.mjs`：使用虚构歌曲 ID/tag，截获而不真正发送到第三方；严格校验真实传输头与脱敏内存记录的分离。
4. Phase 1 和隔离 Edge 工作流都加入此检查，且 `src/source-manager.js` 变更可以触发相应 CI。故障测试仍必须红灯，不得伪造媒体成功。

相关提交：
- `7996b3dedb7720a2037cfb08d6da9cd7a713a85e`：正确的脱敏正则最终实现。
- `e23f4a23e1bdba47496735d6248a4f20b5e54bac`：浏览器测试。
- `6d6715b13e09ca13616e5171b7c8107506591f6a`：本地浏览器 CI。
- `603e6c7117116241e53ea80e49ec0d03154feb38`：Cloudflare 隔离预览 CI。

注意：第一次提交 `6fd7feae58f2f29411af3ec378efebc1cbd04293` 中新正则转义错误，真实本地 CI `41272081829` 因语法问题失败；在 `7996b3d` 中修正，后续网络及浏览器测试均成功。不可隐藏这一中间失败。

## 真实验收和可核实结论

[Phase 1 浏览器 CI 41272150618](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41272150618)：**completed/success**。

- `FYMUSIC_RUNTIME_REQUEST_REDACTION_PASS`
- 受控浏览器确认：`signedTransportPreserved=true`、`needleHttp502Preserved=true`、`noSensitiveDebugSnapshots=true`。
- KG→KW fixture UI、手动确认、固定 FLAC24bit、旧回调取消、显式重试等行为仍通过（不把 fixture 当作真实 FLAC 播放）。

[本地真实 Flower CI 41272105071](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41272105071)：**completed/success**，确认修正正则之后原始 Flower 仍可完成真实 KW 媒体播放。

[真实 Cloudflare Edge Preview CI 41272192056](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41272192056)，Job `124747063195`：**completed/success**。

开发隔离预览：https://51962c7f.only-testing-online-music.pages.dev

- Cloudflare API 安全检查证实正式生产分支是 `main`，仅将开发代码部署到 Preview。
- 原始 Flower 脚本已加载；真实 KG musicUrl HTTP 502，用户手动确认的 KW musicUrl HTTP 200；媒体 HTTP 206，浏览器 `readyState=4`、`paused=false`、媒体时长 ~271.49 秒，持续播放时间增加。
- KW 成功路线 `sslip-full`，不是新增的 `canonical-short-socket`。
- KW 目录仅搜索 1 次、KW Flower 解析 1 次、媒体请求 1 次；没有自动重复，用户手动重试 0 次。
- 从 KW 二次确认到音频就绪 ~2190ms；从 KG 点击到完成额外 3.3 秒的持续播放观察 ~7625ms。
- 新脱敏 QA 在同一 Edge Preview 上再次通过。
- 本次 LongTask 1 次最长 ~91ms，在初始化阶段；FCP ~312ms、DOMContentLoaded ~424ms，GitHub Chromium 单次样本，不代表跨设备性能承诺。
- 本次野花只向测试声明 `128k`；实际解码器格式/码率/采样率未获可靠属性，继续保持未知。

### 新证据：真实 Flower 原始 HTTP 404 触发短 TCP 路径，但仍失败

本次 Edge 的 KG 请求中：
- `canonical-socket` → `FLOWER_SOCKET_HTTP_404`
- 按既有有条件逻辑执行 `canonical-short-socket` → `FLOWER_SOCKET_HTTP_403`
- `ts`/`tm` 全路径与短路径返回 HTTP 530；`nip-short` 返回 403，其他 DNS 路径曾返回 400/403。
- 因此 **短 TCP 回退逻辑确实在真实 Cloudflare Edge 的 KG 404 场景中执行**，但没有恢复歌曲。不能宣称“真实回退成功”或据此更换供应商。失败可能是路径或源端策略、签名/鉴权，也可能由网络条件造成；当前不能锁定根因。

## 下一阶段建议

1. 针对 **404→403 的原始同 IP 两路径**，对照官方 LX Desktop 同请求格式，重点比较路径、Host、Accept 和源脚本自定义头；使用安全的字段存在性/协议分类比对，不打印 `tag`。
2. 保持用户主动选择的真实最高源声明品质，不做未声明 FLAC、320k 的假成功。
3. 继续以真实 Edge 与受控单测双重验收；实际远端失败应让 CI 失败，不应通过夹带 fixture 媒体粉饰。
4. 生产分支 `main` 未改动。
