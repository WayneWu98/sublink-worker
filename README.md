<div align="center">
  <img src="public/favicon.png" alt="Sublink Worker" width="120" height="120"/>

  <h1><b>Sublink Worker</b></h1>
  <h5><i>One Worker, All Subscriptions</i></h5>

  <p><b>A lightweight subscription converter and manager for proxy protocols, deployable on Cloudflare Workers, Vercel, Node.js, or Docker.</b></p>

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
    <a href="https://app.sublink.works"><b>⚡ Live Demo</b></a> ·
    <a href="https://sublink.works/en/"><b>Documentation</b></a> 
    <a href="https://sublink.works"><b>中文文档</b></a>·
  </p>
  <p>
    <a href="https://sublink.works/guide/quick-start/">Quick Start</a> ·
    <a href="https://sublink.works/api/">API Reference</a> ·
    <a href="https://sublink.works/guide/faq/">FAQ</a>
  </p>
</div>

## 🚀 Quick Start

### One-Click Deployment
- Choose a "deploy" button above to click
- That's it! See the [Document](https://sublink.works/guide/quick-start/) for more information.

### Alternative Runtimes
- **Node.js**: `npm run build:node && node dist/node-server.cjs`
- **Vercel**: `vercel deploy` (configure KV in project settings)
- **Docker**: `docker pull ghcr.io/7sageer/sublink-worker:latest`
- **Docker Compose**: `docker compose up -d` (includes Redis)

## ✨ Features

### Supported Protocols
ShadowSocks • VMess • VLESS • Hysteria2 • Trojan • TUIC

### Client Support
Sing-Box • Clash • Xray/V2Ray • Surge

### Input Support
- Base64 subscriptions
- HTTP/HTTPS subscriptions
- Full configs (Sing-Box JSON, Clash YAML, Surge INI)

### Core Capabilities
- Import subscriptions from multiple sources
- Generate fixed/random short links (KV-based)
- Light/Dark theme toggle
- Flexible API for script automation
- Multi-language support (Chinese, English, Persian, Russian)
- Web interface with predefined rule sets and customizable policy groups

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

## 🔐 Short Link Token Authentication (v2.5+)

As of v2.5, the `/shorten-v2` endpoint:

- **Response is now JSON** (previously `text/plain`). Shape: `{ "code": "<shortcode>", "token": "<32-hex-token>" }`.
- **Overwriting an existing short code requires** sending the `X-Shortlink-Token: <token>` header. The token is returned exactly once, on creation — save it.
- **Legacy short links** (created before this version) are tokenless. The first caller who references such a short code will claim it and receive a fresh token; after that, subsequent overwrites require that token.
- **403 responses** (JSON `{ error, reason }` with `reason` being `missing` or `mismatch`) are returned when authorization fails.

Migration: external scripts that read `/shorten-v2` response as text must parse JSON and handle the new `token` field.

## 🔐 Short Code Loader + Read Authentication (v2.6+)

Building on v2.5's token system:

- **New UI entry point**: a "Load from Code" button appears to the left of Paste/Clear on the main input. It opens a modal accepting a short code and optional token, then loads the original subscription configuration back into the form and captures the token so a subsequent "Shorten" call overwrites the same short code.
- **`/resolve` is now conditionally authenticated**: entries created under v2.5+ require the matching `X-Shortlink-Token` header. Missing token → 401 (reason `missing`). Wrong token → 403 (reason `mismatch`). Legacy entries (created before v2.5) remain anonymously readable.
- **Auto-parse of pasted short URLs has been removed**. Pasting a short URL (e.g. `https://<host>/b/<code>`) into the main input textarea no longer fetches and populates the form. Use the new "Load from Code" button instead.
- **`/b/:code`, `/c/:code`, `/x/:code`, `/s/:code` redirect endpoints are unchanged** — they continue to resolve anonymously so existing short links on the open internet keep working.

Migration: any external tooling that called `/resolve` on a new-format short code must now supply `X-Shortlink-Token`.

## 🔐 Surge `#!MANAGED-CONFIG` Short-URL Preservation (v2.7+)

Surge responses previously embedded the long converter URL (e.g. `/surge?config=...`) in their `#!MANAGED-CONFIG` directive. As of v2.7:

- When a Surge client subscribes via a short link (`/s/:code`), the returned config's `#!MANAGED-CONFIG` line now points at the **short URL** (e.g. `https://<host>/s/abc123`). The client stays pinned to the short link; subsequent `/shorten-v2` overwrites of the same code are automatically picked up on the next client refresh, with no manual reconfiguration.
- Direct access to `/surge?config=...` (no short link involved) is unchanged — the long request URL is written into `MANAGED-CONFIG`.
- A new optional query parameter `sub_url` is accepted by `/surge`. It must be a **same-origin** absolute URL; cross-origin or malformed values are silently ignored (stripped from the fallback URL) to prevent malicious URL override.

**One-time migration for existing subscribers:** Surge clients already pinned to the long URL (from an earlier build) will not auto-migrate. Re-enter the short URL in Surge once to pick up the new behavior.

## ⭐ Star History

Thanks to everyone who has starred this project! 🌟

<a href="https://star-history.com/#7Sageer/sublink-worker&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=7Sageer/sublink-worker&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=7Sageer/sublink-worker&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=7Sageer/sublink-worker&type=Date" />
 </picture>
</a>
