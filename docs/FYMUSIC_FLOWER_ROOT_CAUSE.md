# FyMusic — Flower 音质及酷狗解析 502 根因核查

## 证据来源

独立分支 `feature/fymusic-playback-verifier` 的 GitHub Actions：
`FyMusic Flower Root Cause`，运行 `41097096991`。

该任务使用原始、未修改的野花脚本、真实 LX Desktop 兼容运行时、
真实音乐平台搜索和 Cloudflare Pages 本地开发代理。它不模拟解析结果。

## 发现（2026-10-31，SGT）

1. **野花脚本版本完全一致。** 当前浏览器从
   `pdone/lx-music-source/main/flower/latest.js` 导入的源码 SHA-256
   与 GitHub Actions 同时从原地址下载的源码哈希完全相同，
   兼容运行时的 `env` 为 `desktop`。
2. **音质声明来自该源。** 野花初始化返回的 WY/TX/KG 各频道的
   `qualitys` 都只有 `128k`。FyMusic 的「最高」模式当前优先选
   *已声明的最高有损格式*，而不自动选 FLAC。测试里选择 128k 是因为
   野花返回的可选格式只有这一项；不得将搜索结果中的 FLAC 文件哈希
   当成野花支持 FLAC 解析的证明。
3. **酷狗两条候选一致复现。** 孙燕姿《开始懂了》酷狗搜索结果中
   有多条同名歌手候选。前两条的基础 hash 和 128k/320k/flac
   分档 hash 形状均有效，但音乐 URL 解析仍失败。
4. **请求结构未发现明显错误。** 两个酷狗请求均使用规范的
   `/flower/v1/url/kg/...` 路径、128k 类型，且路由身份匹配
   对应候选的分档 hash；`tag` 存在并与独立 UTF-8 编码计算一致。
   `User-Agent` 符合 Desktop 格式，`source-ver` 也存在。
   这些仅能证明代码内的字段一致性，**不证明上游服务认可签名**。
5. **代理 502 是所有线路未成功的汇总，不是原始 Flower 的 HTTP 502。**
   两条候选都出现：
   - canonical-socket: `FLOWER_SOCKET_HTTP_400`
   - 两条短路径域名别名: HTTP 403
   - 两条完整路径域名别名: HTTP 400
   - `ts.tempmusic.tk` / `tm.tempmusic.tk` 的短/完整路径：`NETWORK_ERROR`
   - 所以 FyMusic 代理最终分类为 `FLOWER_UPSTREAM_UNAVAILABLE`，HTTP 502。
6. **对照：WY 正常。** 同轮孙燕姿《开始懂了》网易云候选，
   在同一原始野花脚本与相同代理中得到有效 musicUrl。
   因此不能笼统判定 Cloudflare 到所有 Flower 服务的网络都不可达。

## 当前不能断定

- 是上游 KG 签名规则变化、KG 专属服务故障、账号/权限限制、
  具体候选身份差异，还是 Web/原版 LX Desktop 的底层请求差异。
- 320k 或 FLAC 是否可用：虽然酷狗平台搜索元信息出现相应 hash，
  **野花运行时没有声明对应的播放格式**，不能假定可播放。
- WY/TX HTTP 206 的音频时长与进度不能证明字节就是目标歌曲或
  整首歌能够稳定播放。

## 下一步（单独阶段）

使用相同原始野花脚本和相同酷狗候选，在 GitHub Actions 的 Windows
官方 LX Music Desktop 中对照 native preload 的请求字段与响应分类。
只比较脱敏的布尔值/状态码，不记录 URL、hash、tag、Cookie 或歌曲 ID。
如果 Native 与 Web 完全一致仍返回 KG 400，则优先定位上游服务；
如果 Native 成功而 Web 返回 400，逐一对比传输、默认请求头及客户端身份。
不要直接修改上游脚本、绕过授权或声称已修复酷狗播放。
