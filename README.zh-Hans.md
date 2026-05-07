<div align="center">
  <img src="public/favicon.png" alt="Sublink Worker" width="120" height="120"/>

  <h1><b>Sublink Worker</b></h1>
  <h5><i>一个 Worker，管理所有订阅</i></h5>

  <p><b>一款轻量级的代理协议订阅转换与管理工具，可部署于 Cloudflare Workers、Vercel、Node.js 或 Docker。</b></p>

  <p><a href="README.md">English</a> · <b>简体中文</b></p>

  <a href="https://trendshift.io/repositories/12291" target="_blank">
    <img src="https://trendshift.io/api/badge/repositories/12291" alt="7Sageer%2Fsublink-worker | Trendshift" width="250" height="55"/>
  </a>

  <br>

<p style="display: flex; align-items: center; gap: 10px;">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/7Sageer/sublink-worker">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers" style="height: 32px;"/>
  </a>
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/7Sageer/sublink-worker&env=KV_REST_API_URL,KV_REST_API_TOKEN&envDescription=Vercel%20KV%20credentials%20for%20data%20storage&envLink=https://vercel.com/docs/storage/vercel-kv">
    <img src="https://vercel.com/button" alt="Deploy to Vercel" style="height: 32px;"/>
  </a>
</p>

  <h3>📚 文档</h3>
  <p>
    <a href="https://subconverter.wayne-wu.com"><b>⚡ 在线演示</b></a> ·
    <a href="https://sublink.works/en/"><b>English Docs</b></a> ·
    <a href="https://sublink.works"><b>中文文档</b></a>
  </p>
  <p>
    <a href="https://sublink.works/guide/quick-start/">快速开始</a> ·
    <a href="https://sublink.works/api/">API 参考</a> ·
    <a href="https://sublink.works/guide/faq/">常见问题</a>
  </p>
</div>

## 🔱 关于此 Fork

本仓库是 **[7Sageer/sublink-worker](https://github.com/7Sageer/sublink-worker)** 的社区 Fork，维护地址为 **[WayneWu98/sublink-worker](https://github.com/WayneWu98/sublink-worker)**。原项目的所有功劳归上游作者所有。

**与上游的差异（截至撰写时）：**

- **短链 Token 鉴权（v2.5+）** —— `/shorten-v2` 返回 `{code, token}`；覆盖已存在的短码需要携带匹配的 `X-Shortlink-Token` 请求头。
- **短码加载 UI + `/resolve` 读取鉴权（v2.6+）** —— 新增显式的「通过短码加载」按钮，取代原先粘贴自动解析的流程；`/resolve` 对新格式条目启用鉴权。
- **Surge `#!MANAGED-CONFIG` 短链保留（v2.7+）** —— 通过短链获取的 Surge 配置会在 `MANAGED-CONFIG` 指令中保留短链 URL，短码重新映射可自动生效，无需在客户端重新配置。
- **规则组扩展（v2.9+）** —— 新增 15 个内置扩展规则组；可订阅的「自定义规则集」支持 MetaCubeX / blackmatrix7 / Loyalsoldier / ACL4SSR / 自定义 URL 五种源，每条自动生成独立策略组；自定义规则的「出站」改为下拉选择有效目标；新增「漏网之鱼出站」设置；分享链接新增 `customRuleSets` 和 `fallback_outbound` 参数。
- **自定义规则 IP CIDR 的 `no-resolve` 开关（v2.9.2+）** —— 上游对所有自定义 `IP-CIDR` 规则硬编码 `no-resolve`，导致客户端拿到域名（而非 IP）评估规则时，IP 规则永远不会命中（Surge 系统代理 / HTTPS CONNECT 场景下流量会直接漏到 Final）。本 Fork 在每条自定义规则的 IP CIDR 字段旁加了一个开关，开启后去除 `no-resolve` 标志，让客户端主动解析 DNS 以比对 IP 规则。默认关闭以保持与上游一致。仅影响 Clash / mihomo / Surge 输出，sing-box 无此概念。

每项改动的详细说明与迁移指南参见下方「更新日志」章节。

## ⚠️ 数据留存须知

**短链与存储的自定义配置会将你的数据（包括凭据）持久化到后端 KV 存储。** 在使用本工具前 —— 尤其是面向公网的实例 —— 请务必了解哪些内容会被写入：

### `/shorten-v2`（以及 Web 界面的「Shorten」按钮）

提交订阅生成短链时，会将**你提交的完整 query string** 写入 KV，键为生成的短码。该 query string 包括 `config` 参数，它携带：

- 原始代理 URI（`vmess://`、`vless://`、`ss://`、`hysteria2://`、`trojan://`、`tuic://` 等）—— 这些编码包含**服务器地址、UUID、密码与预共享密钥**。
- 你粘贴的 HTTP/HTTPS 订阅链接。
- 你选择的规则与自定义规则集。

存储格式（v2.5+）：`{ "q": "<完整 query string>", "t": "<32 位十六进制 token>" }`。历史条目（v2.5 之前）仅存储原始 query string。

### `POST /config`（自定义基础配置上传）

上传自定义 Sing-Box / Clash / Surge 基础配置时，会将**完整配置内容**写入 KV，键为生成的 ID。若你的基础配置包含账户凭据、策略规则或 DNS 设置等你视为隐私的信息，它们将原样持久化。

### 「后端 KV」实际位置

- **自托管（Cloudflare Workers / Vercel KV / Upstash Redis / 通过 Docker 部署本地 Redis）：** 数据存储于**你自己**配置的 KV 后端。留存、访问与删除由你负责。
- **公共实例：** 数据存储于运营该实例者的 KV 中。请将任何公共实例视为掌握你代理凭据的不可信第三方。

### TTL

短链与存储配置遵守可选的 `shortLinkTtlSeconds` / `configTtlSeconds` 配置。若未设置，条目会一直保留，直到手动删除。

### 建议

如果你的订阅包含敏感凭据，**请自行托管**，避免使用公共实例，并配置合理的 TTL。

## 🚀 快速开始

### 一键部署
- 点击上方任一「Deploy」按钮即可
- 就是这么简单！更多信息请参阅[文档](https://sublink.works/guide/quick-start/)。

### 其他运行方式
- **Node.js**：`npm run build:node && node dist/node-server.cjs`
- **Vercel**：`vercel deploy`（在项目设置中配置 KV）
- **Docker**：`docker pull callmewaynewu/sublink-worker:latest`
- **Docker Compose**：`docker compose up -d`（内含 Redis）

## ✨ 功能特性

### 支持的协议
ShadowSocks · VMess · VLESS · Hysteria2 · Trojan · TUIC · Snell¹

¹ Snell 在 Surge 与 Clash（Mihomo）侧原生输出。Sing-Box 无原生 Snell 出站，Snell 节点会被跳过并在控制台输出警告。

### 客户端支持
Sing-Box · Clash · Xray/V2Ray · Surge

### 输入支持
- Base64 订阅
- HTTP/HTTPS 订阅
- 完整配置（Sing-Box JSON、Clash YAML、Surge INI）
- `snell://` 分享链接（本工具自定义格式 —— 见下方 [Snell](#snell) 段）

### Snell

- **支持输入：**
  - Surge 配置整段（含 `[Proxy]` 段直接粘贴）
  - Clash YAML（`type: snell` 节点，支持 `obfs-opts: {mode, host}`）
  - `snell://` 分享链接 —— *本工具自定义格式，无社区标准*：
    ```
    snell://<url-encoded-psk>@<host>:<port>?version=<n>&obfs=<http|tls>&obfs-host=<h>&tfo=<bool>&reuse=<bool>&udp=<bool>#<name>
    ```
    必填项仅 `psk` 与 `host:port`。别处（Surgio 等）生成的 `snell://` URL 各家约定不同，不保证能直接解析。
- **输出：** Surge ✓ 原生 · Clash（Mihomo）✓ 原生 · Sing-Box ✗ 跳过并控制台警告。

### 核心能力
- 从多种来源导入订阅
- 生成固定/随机短链（基于 KV）
- 亮色/暗色主题切换
- 便于脚本自动化的灵活 API
- 多语言支持（中文、英文、波斯语、俄语）
- 带预设规则集与可自定义策略组的 Web 界面

## 🧩 规则组

### 扩展规则组

在「规则选择」卡片里点击「展开更多规则组」即可看到 15 个额外分组：Discord、WhatsApp、Signal、Line、Zoom、Spotify、News、Reddit、Twitch、Pixiv、Developer、OpenAI、Anthropic、Speedtest、Porn。这些分组不包含在任何预设中，需要用时自行勾选。`minimal` / `balanced` / `comprehensive` 预设行为保持不变。

### 自定义规则集

可订阅任意公开规则集文件并注册为独立策略组。展开高级选项中的「自定义规则集」卡片，新增一项：

- **源（Provider）**：MetaCubeX、blackmatrix7、Loyalsoldier、ACL4SSR 或 `Custom URL`
- **文件名**（源 ≠ `Custom URL`）：文件 stem，如 `reddit`、`spotify`、`Notion`；sing-box / Clash / Surge 的 URL 会自动按目标格式拼出，面板下方实时预览
- **自定义 URL**（源 = `Custom URL`）：分别填 sing-box（`.srs`）、Clash（`.mrs`/`.yaml`）、Surge（`.list`）。只填了哪个格式就只在哪个格式生效
- **类型**：`site` 匹配域名，`ip` 匹配 IP 段
- **出站**：命中流量的目标策略（`Proxy`、`Direct`、`Reject` 或任意选择器名）

自定义规则集会随分享链接的 `customRuleSets` 参数一并往返。若某个源没有对应格式（例如 ACL4SSR 没有 sing-box `.srs`），导出该格式时会自动跳过，不会影响其他格式。

### 漏网之鱼出站

未命中任何规则时流量走哪里现在可以在「高级选项 → 通用设置」里选——`节点选择`（默认）、`DIRECT` 或 `REJECT`。

## 🗒️ 更新日志

### v2.10.3

- **保留自定义 Surge 基础配置中的 `[Host]`、`[URL Rewrite]`、`[Header Rewrite]`、`[MITM]`、`[Script]`、`[SSID Setting]` 段。** 之前的基础配置校验器要求 Surge INI 必须含有 `[General]` / `[Replica]` / `[Proxy]` / `[Proxy Group]` 之一,因此仅有 `[Host] *.company.ponte = 127.0.0.1` 这种合法片段会被判定非法。即便侥幸通过,这些段在生成配置时也会被静默丢弃 —— Surge 构建器只输出 5 个自动生成的段。现在解析器识别这六个常见的 passthrough 段,每段以 raw line 数组存放;校验器接受任何含有至少一个已识别段的输入(只含 `[Rule]` 的片段也能通过)。生成时每个非空 passthrough 段在 `[Rule]` 之后按 Surge 的标准顺序追加,内容原样回写。行与原输入完全一致;注释和空行会按现有 INI 解析器行为剥离。JSON 格式的 Surge 基础配置路径同样应用了"至少一个已识别段"的校验,`{}` / `null` / 数组 / 全是无关键的对象会在校验阶段直接报错,不再放行后才在下游悄悄出问题。
- **修复内存 KV 下保存的配置秒删问题。** `MemoryKVAdapter.scheduleExpiration` 直接调用 `setTimeout(fn, ttlMs)`,而 Node.js 在 `ttlMs >= 2^31`(~24.85 天)时会静默降级到 1 ms。默认 `configTtlSeconds` 是 30 天,所以每一次 `POST /config` 存进去的配置都在下个 event-loop tick 就被删了 —— 后续 `/surge?configId=…` 拿到 `null`,静默落回默认基础配置。改用 put 时记录绝对到期时间戳、get 时懒检查的方案。任何用 node-server / Vercel 构建且没接 Redis 的部署都受影响;Cloudflare Workers / Upstash / Redis 后端的部署不受影响。
- **三个表单的动画对齐。** Surge 设备、自定义规则集、自定义规则三处的添加/删除/清空动画统一,表单/JSON 模式切换的 fade-scale 过渡也统一。原本 Surge 设备没有任何动画;自定义规则集有单卡片动画但缺模式切换过渡。

### v2.10.2

- **自定义规则/规则集支持 Surge `DEVICE:device_name` 出站。** 新增「Surge 设备」区域,先声明 Ponte 设备名(如 `tower`、`my-iphone`),声明后会作为 `DEVICE:<名称>` 选项出现在「自定义规则」和「自定义规则集」的出站下拉中。Surge 配置里 `DEVICE:` policy 直通输出,不会生成 wrapper proxy group,流量直接发往设备(`DOMAIN-SUFFIX,work.com,DEVICE:my-iphone` 与 `RULE-SET,<url>,DEVICE:tower`)。Clash / Sing-Box 没有等价语法,带 `DEVICE:` 出站的规则与规则集在这两种格式下静默跳过(不创建 wrapper、不生成 rule-provider、不留 orphan rule-set 声明)。设备列表与 `customRules`、`customRuleSets` 一起持久化在订阅链接里,且解码顺序保证设备先于二者就位,跨引用关系不会因 URL 往返而丢失。

### v2.10.1

同步上游 `7Sageer/sublink-worker` 的六项 bug 修复,均不影响 v2.10.0 引入的 Snell 支持。

- **自定义规则选择器恢复完整节点列表**(#371)。自定义规则的策略组(如"YouTube → 我的节点")现在会列出单个节点,而不只是 Node Select / Auto Select / 手动切换 / DIRECT 这几条聚合项。此前节点列表缺失,用户只能通过聚合选择器路由。
- **`/xray` 端点保留 subscription-userinfo**(#362、#382)。xray 端点现在会把上游订阅返回的 `subscription-userinfo` HTTP 头透传给客户端,与 `/singbox` `/clash` `/surge` 行为一致。Surge / Stash / Loon 等客户端在 xray 模式下重新可见流量与到期信息。
- **更稳的远程订阅解码**。当订阅响应已经是明文 Surge / Clash / Sing-Box 配置或 `ss://` / `vmess://` 等分享链接时,`decodeContent` 不再无条件 base64 解码,避免产生乱码。`detectFormat` 同时增加对 Surge 文本的识别。
- **拒绝空 Clash 代理组**(#378)。用户提供的 `url-test` / `fallback` 组若 `proxies: []` 且没有 `use:` 引用,现在会返回 400 并指明出错组名,而不是静默用全部节点填充。
- **Sing-Box 1.11+ schema**(#380)。移除基础配置里的旧式 `{type:'block', tag:'REJECT'}` 特殊出站与已废弃的 `independent_cache` 字段。Ad Block 规则改用 1.11+ 的 `action: reject` route action,而非路由到 REJECT 出站。sing-box 的策略组不再含 `REJECT`。新增清扫步骤会移除用户上传的 base config 里残留的 `block` / `dns` 出站引用。
- **稳定的自动 provider 名**(#379)。auto-provider 标签改为基于源 URL FNV-1a 32-bit 哈希的 `_auto_provider_<base36>`,不再是每次构建都会变的 `_auto_provider_1` / `_2` 索引。重复 URL 自动去重,哈希冲突用 `_2` / `_3` 后缀避让。Clash `proxy-providers` 与 Sing-Box `outbound_providers` 同步生效。升级后客户端会重新拉取一次 provider 缓存。

### v2.10.0

- **新增 Snell 协议支持。** 可识别 Surge 配置段、Clash YAML（`type: snell`，含 `obfs-opts`）以及本工具自定义的 `snell://` 分享链接形式（`snell://<psk>@<host>:<port>?version=&obfs=&obfs-host=&tfo=&reuse=&udp=#name`）。输出端 Surge 与 Clash（Mihomo）原生支持；Sing-Box 无原生 Snell 出站，遇到 Snell 节点时会跳过并在控制台输出警告，不进入策略组。`snell://` 链接为本工具自定义格式，**非社区标准** —— 来自其他工具（Surgio 等）的 `snell://` URL 各家约定不同,不保证可直接解析。

### v2.9.2

- **自定义规则 IP CIDR 的 `no-resolve` 开关。** 上游对所有用户自定义的 `IP-CIDR` 规则都硬编码了 `no-resolve`，导致客户端在拿到域名（而非 IP）去评估规则时，IP 规则永远不会被命中 —— 流量会静默漏到 Final（Surge 的系统代理 / HTTPS CONNECT 场景尤其常见）。本 Fork 在每条自定义规则的 IP CIDR 字段旁加了一个开关，开启后去除该条规则的 `no-resolve` 标志，客户端会主动解析 DNS 以比对此 IP 规则，从而真正命中。默认关闭，保持与上游一致。仅影响 Clash / mihomo / Surge 输出；sing-box 本身无 `no-resolve` 概念，不受影响。

### v2.9.1

- **修复**：名字叫 `DIRECT` / `REJECT` / `PASS` 等保留词的自定义规则或自定义规则集不再错误地生成同名策略组。Surge 之前会直接报"策略组不可以使用内部策略名"；其他客户端则会静默把内置动作替换成自建选择器。
- 去除 Surge `[Proxy]` 段里多余的 `DIRECT = direct` 这一行。

### v2.9.0

- **15 个扩展规则组**，默认折叠在展开面板里（Discord / WhatsApp / Signal / Line / Zoom / Spotify / News / Reddit / Twitch / Pixiv / Developer / OpenAI / Anthropic / Speedtest / Porn），预设保持不变。
- **自定义规则集**——订阅任意公开 ruleset 文件（MetaCubeX / blackmatrix7 / Loyalsoldier / ACL4SSR / 自定义 URL），每条会生成独立的策略组，表单中的「出站」字段作为该组的默认选项。分享链接通过 `customRuleSets` 参数往返。
- **自定义规则的「出站」**从自由文本改为下拉（内置出站 + 已选规则组 + 上方自定义规则集）。
- **漏网之鱼出站**可配置（节点选择 / DIRECT / REJECT）。
- 统一的 `<select>` chevron 箭头与内边距、添加/删除行动画、引用对象删除后自动回退默认出站。

### v2.7

**Surge `#!MANAGED-CONFIG` 短链保留。** 此前 Surge 响应会在 `#!MANAGED-CONFIG` 指令中嵌入长转换 URL（如 `/surge?config=...`）。

- 当 Surge 客户端通过短链（`/s/:code`）订阅时，返回配置中的 `#!MANAGED-CONFIG` 行会改为指向**短链 URL**（如 `https://<host>/s/abc123`）。客户端将保持绑定在短链上；之后对同一短码的 `/shorten-v2` 覆盖操作会在客户端下次刷新时自动生效，无需手动重新配置。
- 直接访问 `/surge?config=...`（不涉及短链）的行为保持不变 —— 长请求 URL 会被写入 `MANAGED-CONFIG`。
- `/surge` 新增可选 query 参数 `sub_url`。该值必须为**同源**绝对 URL；跨域或格式错误的值将被静默忽略（从 fallback URL 中剥除），以防止恶意 URL 注入。

**对已有订阅者的一次性迁移：** 此前已绑定长 URL 的 Surge 客户端（来自早期版本）不会自动迁移。请在 Surge 中重新输入短链一次，以启用新行为。

### v2.6

**短码加载 UI + `/resolve` 读取鉴权。** 在 v2.5 的 Token 机制之上。

- **新增 UI 入口**：主输入区的 Paste/Clear 左侧新增「Load from Code」按钮。它会打开一个弹窗，接收短码与可选 Token，将原始订阅配置加载回表单，并记录 Token，使后续「Shorten」调用可以覆盖同一短码。
- **`/resolve` 启用条件鉴权**：v2.5+ 创建的条目需要匹配的 `X-Shortlink-Token` 请求头。缺失 Token → 401（reason 为 `missing`），Token 错误 → 403（reason 为 `mismatch`）。历史条目（v2.5 之前）仍可匿名读取。
- **移除粘贴短链自动解析。** 在主输入文本框中粘贴短链（如 `https://<host>/b/<code>`）不再自动拉取并填充表单。请使用新增的「Load from Code」按钮。
- **`/b/:code`、`/c/:code`、`/x/:code`、`/s/:code` 跳转端点保持不变** —— 仍支持匿名解析，以保证公网上已有的短链继续可用。

迁移说明：任何对新格式短码调用 `/resolve` 的外部工具，现在都必须提供 `X-Shortlink-Token`。

### v2.5

**短链 Token 鉴权**，作用于 `/shorten-v2` 接口。

- **响应改为 JSON**（此前为 `text/plain`）。结构：`{ "code": "<shortcode>", "token": "<32-hex-token>" }`。
- **覆盖已存在的短码需要**发送 `X-Shortlink-Token: <token>` 请求头。Token 仅在创建时返回一次 —— 请妥善保存。
- **历史短链**（本版本之前创建的）无 Token。首位引用这类短码的调用方将认领该短链并获取新 Token；之后的覆盖操作需使用该 Token。
- **鉴权失败返回 403**（JSON `{ error, reason }`，`reason` 为 `missing` 或 `mismatch`）。

迁移说明：以文本方式读取 `/shorten-v2` 响应的外部脚本需改为解析 JSON，并处理新增的 `token` 字段。

## 🤝 贡献

欢迎通过 Issue 与 Pull Request 改进本项目。

## 📄 许可证

本项目基于 MIT 协议发布 —— 详见 [LICENSE](LICENSE)。

## ⚠️ 免责声明

本项目仅用于学习与交流，请勿用于非法用途。因使用本项目产生的任何后果均由使用者自行承担，与开发者无关。

## 💰 赞助

<div align="center">
  <h3>感谢以下赞助商对本项目的支持</h3>
<table border="0">
  <tr>
    <td>
      <a href="https://yxvm.com/" target="_blank" title="YXVM">
        <img src="https://image.779477.xyz/yxvm.png" alt="YXVM" height="60" hspace="20"/>
      </a>
    </td>
    <td>
      <a href="https://github.com/NodeSeekDev/NodeSupport" target="_blank" title="NodeSupport">
        <img src="https://image.779477.xyz/ns.png" alt="NodeSupport" height="60" hspace="20"/>
      </a>
    </td>
  </tr>
</table>
  <p>若希望赞助本项目，请联系开发者 <a href="https://github.com/7Sageer" style="text-decoration: none;">@7Sageer</a></p>
</div>

## ⭐ Star 历史

感谢每一位为本项目点亮 Star 的朋友！🌟

<a href="https://star-history.com/#7Sageer/sublink-worker&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=7Sageer/sublink-worker&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=7Sageer/sublink-worker&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=7Sageer/sublink-worker&type=Date" />
 </picture>
</a>
