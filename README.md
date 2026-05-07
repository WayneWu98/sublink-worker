<div align="center">
  <img src="public/favicon.png" alt="Sublink Worker" width="120" height="120"/>

  <h1><b>Sublink Worker</b></h1>
  <h5><i>One Worker, All Subscriptions</i></h5>

  <p><b>A lightweight subscription converter and manager for proxy protocols, deployable on Cloudflare Workers, Vercel, Node.js, or Docker.</b></p>

  <p><b>English</b> · <a href="README.zh-Hans.md">简体中文</a></p>

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

  <h3>📚 Documentation</h3>
  <p>
    <a href="https://subconverter.wayne-wu.com"><b>⚡ Live Demo</b></a> ·
    <a href="https://sublink.works/en/"><b>Documentation</b></a> 
    <a href="https://sublink.works"><b>中文文档</b></a>·
  </p>
  <p>
    <a href="https://sublink.works/guide/quick-start/">Quick Start</a> ·
    <a href="https://sublink.works/api/">API Reference</a> ·
    <a href="https://sublink.works/guide/faq/">FAQ</a>
  </p>
</div>

## 🔱 About This Fork

This is a community fork of **[7Sageer/sublink-worker](https://github.com/7Sageer/sublink-worker)** maintained at **[WayneWu98/sublink-worker](https://github.com/WayneWu98/sublink-worker)**. All credit for the original project goes to the upstream authors.

**Differences from upstream (at the time of writing):**

- **Short-link token auth (v2.5+)** — `/shorten-v2` returns `{code, token}`; overwriting an existing short code requires the matching `X-Shortlink-Token` header.
- **Short code loader UI + `/resolve` read auth (v2.6+)** — Explicit "Load from Code" button replaces the removed paste-auto-parse flow; `/resolve` now authenticates new-format entries.
- **Surge `#!MANAGED-CONFIG` short-URL preservation (v2.7+)** — Surge configs fetched via a short link embed the short URL in `MANAGED-CONFIG` so short-code remaps propagate without client reconfiguration.
- **Rule groups expansion (v2.9+)** — 15 extended built-in rule groups, subscribable Custom RuleSets backed by a provider dictionary (MetaCubeX / blackmatrix7 / Loyalsoldier / ACL4SSR / custom URL) that each register their own proxy group, Custom Rules outbound as a dropdown of valid targets, configurable Fall Back default, and `customRuleSets` + `fallback_outbound` share-URL params.
- **Per-rule `no-resolve` toggle for Custom Rules IP CIDR (v2.9.2+)** — Upstream hard-codes `no-resolve` on every user-defined `IP-CIDR` rule, which silently bypasses the rule whenever the client hands the rule engine a hostname instead of an IP (common with Surge's system proxy / HTTPS CONNECT). A switch next to the IP CIDR field drops that flag per rule so the client resolves DNS and the rule actually matches. Default off preserves upstream behavior. Affects Clash / mihomo / Surge output.

See the Changelog below for detailed release notes and migration guidance for each change.

## ⚠️ Data Retention Notice

**Short links and stored configs persist your data, including credentials, to the backend KV store.** Before using this tool — especially a public-facing instance — understand exactly what gets written:

### `/shorten-v2` (and the web UI's "Shorten" button)

Submitting a subscription for shortening writes the **full query string you submitted** to KV under the generated short code. That query string includes the `config` parameter, which carries:

- Raw proxy URIs (`vmess://`, `vless://`, `ss://`, `hysteria2://`, `trojan://`, `tuic://`, …) — these encode **server addresses, UUIDs, passwords, and pre-shared keys**.
- HTTP/HTTPS subscription URLs you pasted in.
- Your selected rules and custom rule sets.

Storage format (v2.5+): `{ "q": "<full query string>", "t": "<32-hex token>" }`. Legacy entries (pre-v2.5) store the raw query string only.

### `POST /config` (custom base config upload)

Uploading a custom Sing-Box / Clash / Surge base config writes the **entire config body** to KV under a generated ID. If your base config contains account credentials, policy rules, or DNS settings you consider private, they are persisted as-is.

### Where "the backend KV" actually is

- **Self-hosted (Cloudflare Workers / Vercel KV / Upstash Redis / local Redis via Docker):** data lives in the KV backend **you** configured. Retention, access, and deletion are your responsibility.
- **Public instance:** data lives in the KV of whoever operates that instance. Treat any public instance as you would any untrusted third party that now holds your proxy credentials.

### TTL

Short links and stored configs respect the optional TTL configured via `shortLinkTtlSeconds` / `configTtlSeconds`. If unset, entries persist indefinitely until manually deleted.

### Recommendation

If your subscription contains credentials you consider sensitive, **self-host** rather than using a public instance, and configure a reasonable TTL.

## 🚀 Quick Start

### One-Click Deployment
- Choose a "deploy" button above to click
- That's it! See the [Document](https://sublink.works/guide/quick-start/) for more information.

### Alternative Runtimes
- **Node.js**: `npm run build:node && node dist/node-server.cjs`
- **Vercel**: `vercel deploy` (configure KV in project settings)
- **Docker**: `docker pull callmewaynewu/sublink-worker:latest`
- **Docker Compose**: `docker compose up -d` (includes Redis)

## ✨ Features

### Supported Protocols
ShadowSocks • VMess • VLESS • Hysteria2 • Trojan • TUIC • Snell¹

¹ Snell outputs natively to Surge and Clash (Mihomo). Sing-Box has no native Snell outbound — Snell nodes are dropped with a console warning.

### Client Support
Sing-Box • Clash • Xray/V2Ray • Surge

### Input Support
- Base64 subscriptions
- HTTP/HTTPS subscriptions
- Full configs (Sing-Box JSON, Clash YAML, Surge INI)
- `snell://` share-links (tool-internal format — see [Snell](#snell) below)

### Snell

- **Input:**
  - Surge config block (paste full text containing `[Proxy]` section)
  - Clash YAML (`type: snell` node, supports `obfs-opts: {mode, host}`)
  - `snell://` share-link — *tool-internal format, not a community standard*:
    ```
    snell://<url-encoded-psk>@<host>:<port>?version=<n>&obfs=<http|tls>&obfs-host=<h>&tfo=<bool>&reuse=<bool>&udp=<bool>#<name>
    ```
    Only `psk` and `host:port` are required. `snell://` URLs from other tools (Surgio, etc.) use different conventions and are not guaranteed to parse.
- **Output:** Surge ✓ native · Clash (Mihomo) ✓ native · Sing-Box ✗ dropped with a console warning.

### Core Capabilities
- Import subscriptions from multiple sources
- Generate fixed/random short links (KV-based)
- Light/Dark theme toggle
- Flexible API for script automation
- Multi-language support (Chinese, English, Persian, Russian)
- Web interface with predefined rule sets and customizable policy groups

## 🧩 Rule Groups

### Extended rule groups

15 additional rule groups (Discord, WhatsApp, Signal, Line, Zoom, Spotify, News, Reddit, Twitch, Pixiv, Developer, OpenAI, Anthropic, Speedtest, Porn) are available behind a "Show more rule groups" disclosure in the Rule Selection card. They are not included in any preset; check them individually when you want them. Presets (`minimal`, `balanced`, `comprehensive`) are unchanged.

### Custom RuleSets

Subscribe to any public rule-set file and register it as an independent proxy group. Expand **Custom RuleSets** under Advanced Options and add an entry:

- **Provider**: pick from MetaCubeX, blackmatrix7, Loyalsoldier, ACL4SSR, or `Custom URL`
- **File name** (non-`Custom URL` providers): file stem such as `reddit`, `spotify`, `Notion` — URL is derived automatically for sing-box/Clash/Surge
- **Custom URL**: supply one URL per format (sing-box `.srs`, Clash `.mrs`/`.yaml`, Surge `.list`). Only formats you fill in will emit
- **Type**: `site` for domain rule-sets, `ip` for IP CIDR rule-sets
- **Outbound**: proxy group for matched traffic (`Proxy`, `Direct`, `Reject`, or any selector name)

Entries round-trip through share links via the `customRuleSets` URL parameter. Providers that do not publish a given format (e.g. ACL4SSR has no sing-box `.srs`) are silently skipped on export — mixed-format subscriptions stay valid.

### Fall Back outbound

The Fall Back selector's default member (what unmatched traffic uses until the user switches) is now configurable from Advanced Options → General Settings. Choose `Node Select` (default), `DIRECT`, or `REJECT`.

## 🗒️ Changelog

### v2.10.0

- **Snell protocol support.** Parses Snell nodes from Surge config blocks, Clash YAML (`type: snell` with `obfs-opts`), and a new tool-internal `snell://` share-link form (`snell://<psk>@<host>:<port>?version=&obfs=&obfs-host=&tfo=&reuse=&udp=#name`). Outputs natively to Surge and Clash (Mihomo); Sing-Box has no native Snell outbound, so Snell nodes are dropped with a console warning and excluded from selector groups. The `snell://` URL is *not* a community standard — URLs from other tools (Surgio, etc.) follow different conventions and are not guaranteed to round-trip.

### v2.9.2

- **Per-rule `no-resolve` toggle for Custom Rules IP CIDR.** Upstream emits every user-defined `IP-CIDR` rule with `no-resolve` hard-coded, so the rule silently never matches when the client evaluates rules against a hostname instead of an IP (common with Surge's system proxy / HTTPS CONNECT — traffic falls through to Final). This fork adds a switch next to each custom rule's IP CIDR field that drops the `no-resolve` flag when enabled, letting the client resolve DNS so the IP rule can actually match. Default off preserves upstream behavior. Affects Clash / mihomo / Surge output; sing-box has no equivalent flag and is unchanged.

### v2.9.1

- **Bug fix**: custom rules / rule sets named after a reserved outbound (e.g. `DIRECT`, `REJECT`, `PASS`) no longer generate a same-named selector group. Surge previously rejected the config with "策略组不可以使用内部策略名"; other clients silently shadowed the built-in action.
- Dropped the redundant `DIRECT = direct` line from Surge's `[Proxy]` section.

### v2.9.0

- **15 extended rule groups** behind a collapsed disclosure (Discord, WhatsApp, Signal, Line, Zoom, Spotify, News, Reddit, Twitch, Pixiv, Developer, OpenAI, Anthropic, Speedtest, Porn). Presets are unchanged.
- **Custom RuleSets** — subscribe to public rule-set files (MetaCubeX / blackmatrix7 / Loyalsoldier / ACL4SSR / custom URL). Each entry becomes its own proxy group; the form's `Outbound` field is that group's default member. Share-link round-trip via `customRuleSets`.
- **Custom Rules outbound** is now a dropdown of valid outbounds (built-in + selected rule groups + custom rule sets) instead of a free-text group name.
- **Fall Back outbound** preference (Node Select / DIRECT / REJECT).
- Global `<select>` chevron + consistent padding, animated row add/delete, auto-reset of referenced outbounds when the source is removed.

### v2.7

**Surge `#!MANAGED-CONFIG` short-URL preservation.** Surge responses previously embedded the long converter URL (e.g. `/surge?config=...`) in their `#!MANAGED-CONFIG` directive.

- When a Surge client subscribes via a short link (`/s/:code`), the returned config's `#!MANAGED-CONFIG` line now points at the **short URL** (e.g. `https://<host>/s/abc123`). The client stays pinned to the short link; subsequent `/shorten-v2` overwrites of the same code are automatically picked up on the next client refresh, with no manual reconfiguration.
- Direct access to `/surge?config=...` (no short link involved) is unchanged — the long request URL is written into `MANAGED-CONFIG`.
- A new optional query parameter `sub_url` is accepted by `/surge`. It must be a **same-origin** absolute URL; cross-origin or malformed values are silently ignored (stripped from the fallback URL) to prevent malicious URL override.

**One-time migration for existing subscribers:** Surge clients already pinned to the long URL (from an earlier build) will not auto-migrate. Re-enter the short URL in Surge once to pick up the new behavior.

### v2.6

**Short code loader UI + `/resolve` read authentication.** Building on v2.5's token system.

- **New UI entry point**: a "Load from Code" button appears to the left of Paste/Clear on the main input. It opens a modal accepting a short code and optional token, then loads the original subscription configuration back into the form and captures the token so a subsequent "Shorten" call overwrites the same short code.
- **`/resolve` is now conditionally authenticated**: entries created under v2.5+ require the matching `X-Shortlink-Token` header. Missing token → 401 (reason `missing`). Wrong token → 403 (reason `mismatch`). Legacy entries (created before v2.5) remain anonymously readable.
- **Auto-parse of pasted short URLs has been removed.** Pasting a short URL (e.g. `https://<host>/b/<code>`) into the main input textarea no longer fetches and populates the form. Use the new "Load from Code" button instead.
- **`/b/:code`, `/c/:code`, `/x/:code`, `/s/:code` redirect endpoints are unchanged** — they continue to resolve anonymously so existing short links on the open internet keep working.

Migration: any external tooling that called `/resolve` on a new-format short code must now supply `X-Shortlink-Token`.

### v2.5

**Short link token authentication** on the `/shorten-v2` endpoint.

- **Response is now JSON** (previously `text/plain`). Shape: `{ "code": "<shortcode>", "token": "<32-hex-token>" }`.
- **Overwriting an existing short code requires** sending the `X-Shortlink-Token: <token>` header. The token is returned exactly once, on creation — save it.
- **Legacy short links** (created before this version) are tokenless. The first caller who references such a short code will claim it and receive a fresh token; after that, subsequent overwrites require that token.
- **403 responses** (JSON `{ error, reason }` with `reason` being `missing` or `mismatch`) are returned when authorization fails.

Migration: external scripts that read `/shorten-v2` response as text must parse JSON and handle the new `token` field.

## 🤝 Contributing

Issues and Pull Requests are welcome to improve this project.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This project is for learning and exchange purposes only. Please do not use it for illegal purposes. All consequences resulting from the use of this project are solely the responsibility of the user and are not related to the developer.

## 💰 Sponsorship

<div align="center">
  <h3>Thanks to the following sponsors for their support of this project</h3>
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
  <p>If you would like to sponsor this project, please contact the developer <a href="https://github.com/7Sageer" style="text-decoration: none;">@7Sageer</a></p>
</div>

## ⭐ Star History

Thanks to everyone who has starred this project! 🌟

<a href="https://star-history.com/#7Sageer/sublink-worker&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=7Sageer/sublink-worker&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=7Sageer/sublink-worker&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=7Sageer/sublink-worker&type=Date" />
 </picture>
</a>
