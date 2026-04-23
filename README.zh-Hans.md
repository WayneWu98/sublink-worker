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

- **短链 Token 鉴权（v2.5+）** —— `/shorten-v2` 返回 `{code, token}`；覆盖已存在的短码需要携带匹配的 `X-Shortlink-Token` 请求头。详见下文。
- **短码加载 UI + `/resolve` 读取鉴权（v2.6+）** —— 新增显式的「通过短码加载」按钮，取代原先粘贴自动解析的流程；`/resolve` 对新格式条目启用鉴权。详见下文。
- **Surge `#!MANAGED-CONFIG` 短链保留（v2.7+）** —— 通过短链获取的 Surge 配置会在 `MANAGED-CONFIG` 指令中保留短链 URL，短码重新映射可自动生效，无需在客户端重新配置。详见下文。

README 下方的版本对应章节包含每项变更的迁移说明。

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
ShadowSocks · VMess · VLESS · Hysteria2 · Trojan · TUIC

### 客户端支持
Sing-Box · Clash · Xray/V2Ray · Surge

### 输入支持
- Base64 订阅
- HTTP/HTTPS 订阅
- 完整配置（Sing-Box JSON、Clash YAML、Surge INI）

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

### 自定义 RuleSet

可订阅任意公开 rule-set 文件并注册为独立策略组。展开高级选项中的「自定义 RuleSet」卡片，新增一项：

- **源（Provider）**：MetaCubeX、blackmatrix7、Loyalsoldier、ACL4SSR 或 `Custom URL`
- **文件名**（源 ≠ `Custom URL`）：文件 stem，如 `reddit`、`spotify`、`Notion`；sing-box / Clash / Surge 的 URL 会自动按目标格式拼出
- **自定义 URL**（源 = `Custom URL`）：分别填 sing-box（`.srs`）、Clash（`.mrs`/`.yaml`）、Surge（`.list`）。只填了哪个格式就只在哪个格式生效
- **类型**：`site` 匹配域名，`ip` 匹配 IP 段
- **出站**：命中流量的目标策略（`Proxy`、`Direct`、`Reject` 或任意选择器名）

自定义 RuleSet 会随分享链接的 `customRuleSets` 参数一并往返。若某个源没有对应格式（例如 ACL4SSR 没有 sing-box `.srs`），导出该格式时会自动跳过，不会影响其他格式。

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

## 🔐 短链 Token 鉴权（v2.5+）

自 v2.5 起，`/shorten-v2` 接口：

- **响应改为 JSON**（此前为 `text/plain`）。结构：`{ "code": "<shortcode>", "token": "<32-hex-token>" }`。
- **覆盖已存在的短码需要**发送 `X-Shortlink-Token: <token>` 请求头。Token 仅在创建时返回一次 —— 请妥善保存。
- **历史短链**（本版本之前创建的）无 Token。首位引用这类短码的调用方将认领该短链并获取新 Token；之后的覆盖操作需使用该 Token。
- **鉴权失败返回 403**（JSON `{ error, reason }`，`reason` 为 `missing` 或 `mismatch`）。

迁移说明：以文本方式读取 `/shorten-v2` 响应的外部脚本需改为解析 JSON，并处理新增的 `token` 字段。

## 🔐 短码加载 + 读取鉴权（v2.6+）

在 v2.5 的 Token 机制之上：

- **新增 UI 入口**：主输入区的 Paste/Clear 左侧新增「Load from Code」按钮。它会打开一个弹窗，接收短码与可选 Token，将原始订阅配置加载回表单，并记录 Token，使后续「Shorten」调用可以覆盖同一短码。
- **`/resolve` 启用条件鉴权**：v2.5+ 创建的条目需要匹配的 `X-Shortlink-Token` 请求头。缺失 Token → 401（reason 为 `missing`），Token 错误 → 403（reason 为 `mismatch`）。历史条目（v2.5 之前）仍可匿名读取。
- **移除粘贴短链自动解析**。在主输入文本框中粘贴短链（如 `https://<host>/b/<code>`）不再自动拉取并填充表单。请使用新增的「Load from Code」按钮。
- **`/b/:code`、`/c/:code`、`/x/:code`、`/s/:code` 跳转端点保持不变** —— 仍支持匿名解析，以保证公网上已有的短链继续可用。

迁移说明：任何对新格式短码调用 `/resolve` 的外部工具，现在都必须提供 `X-Shortlink-Token`。

## 🔐 Surge `#!MANAGED-CONFIG` 短链保留（v2.7+）

此前 Surge 响应会在 `#!MANAGED-CONFIG` 指令中嵌入长转换 URL（如 `/surge?config=...`）。自 v2.7 起：

- 当 Surge 客户端通过短链（`/s/:code`）订阅时，返回配置中的 `#!MANAGED-CONFIG` 行会改为指向**短链 URL**（如 `https://<host>/s/abc123`）。客户端将保持绑定在短链上；之后对同一短码的 `/shorten-v2` 覆盖操作会在客户端下次刷新时自动生效，无需手动重新配置。
- 直接访问 `/surge?config=...`（不涉及短链）的行为保持不变 —— 长请求 URL 会被写入 `MANAGED-CONFIG`。
- `/surge` 新增可选 query 参数 `sub_url`。该值必须为**同源**绝对 URL；跨域或格式错误的值将被静默忽略（从 fallback URL 中剥除），以防止恶意 URL 注入。

**对已有订阅者的一次性迁移：** 此前已绑定长 URL 的 Surge 客户端（来自早期版本）不会自动迁移。请在 Surge 中重新输入短链一次，以启用新行为。

## ⭐ Star 历史

感谢每一位为本项目点亮 Star 的朋友！🌟

<a href="https://star-history.com/#7Sageer/sublink-worker&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=7Sageer/sublink-worker&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=7Sageer/sublink-worker&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=7Sageer/sublink-worker&type=Date" />
 </picture>
</a>
