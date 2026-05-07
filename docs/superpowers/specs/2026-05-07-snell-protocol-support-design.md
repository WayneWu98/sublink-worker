# Snell Protocol Support Design

Date: 2026-05-07

## Goal

Add Snell protocol pass-through so users can include Snell nodes in their input and produce a usable Surge / Clash output. Snell is a Surge-native protocol with no community-standard share-link form; this design adds first-class parsing for the formats Snell actually circulates in (Surge config, Clash YAML), plus a tool-internal `snell://` share-link to support the line-by-line "mix with `ss://` / `vmess://`" workflow that other protocols enjoy.

## Non-Goals

- No Sing-Box implementation of Snell (sing-box has no native Snell outbound; we cannot fabricate one).
- No UI form for Snell node entry. Input remains the existing "输入源" textarea.
- No emission of `snell://` URLs. Outputs are still Surge / Clash / Sing-Box config files, never share-link lists (matches every other protocol in this repo).
- No `mptcp` or other fields that have no Surge counterpart and would silently drop on cross-format conversion.
- No interpretation of Surge-global parameters (`test-url`, `interface`, etc.) — protocol-level only.

## Current State (Baseline)

- Two structured input parsers ignore Snell:
  - [src/parsers/convertSurgeProxyToObject.js](../../../src/parsers/convertSurgeProxyToObject.js) handles `ss` / `vmess` / `trojan` / `tuic` / `hysteria2`. `snell` falls through `default` → `console.warn('Unsupported Surge proxy type: snell')` → `null`.
  - [src/parsers/convertYamlProxyToObject.js](../../../src/parsers/convertYamlProxyToObject.js) handles `ss` / `vmess` / `vless` / `trojan` / `hysteria2`. `snell` returns `null`.
- Share-link parsers in [src/parsers/protocols/](../../../src/parsers/protocols/) cover `ss` / `vmess` / `vless` / `trojan` / `hysteria2` / `tuic`. There is no `snell://` parser. [ProxyParser.js](../../../src/parsers/ProxyParser.js) maps each scheme to its parser; unknown schemes return `undefined`.
- Output builders:
  - [SurgeConfigBuilder.js](../../../src/builders/SurgeConfigBuilder.js) `convertProxy` — switch on `proxy.type` with explicit cases; `default` emits `# <tag> - Unsupported proxy type: <type>` (a comment line that survives in `[Proxy]` but is filtered out of group membership by `getValidProxies`).
  - [ClashConfigBuilder.js](../../../src/builders/ClashConfigBuilder.js) `convertProxy` — switch on `proxy.type`; `default` returns the proxy as-is (object passthrough). For Clash this happens to work for protocols that share field naming with Mihomo.
  - [SingboxConfigBuilder.js](../../../src/builders/SingboxConfigBuilder.js) `convertProxy` — no per-protocol switch; sanitizes generic fields (`udp`, root-level `alpn`, `packet_encoding`) and returns the proxy. An unknown `type` would be emitted as a literal sing-box outbound and break client parse.
- Input dispatch in [BaseConfigBuilder.parseCustomItems](../../../src/builders/BaseConfigBuilder.js) tries (in order): full content as Sing-Box JSON / Clash YAML / Surge INI; base64-decoded variant of the same; line-by-line dispatch where `http(s)://` is treated as a subscription URL and other schemes are routed via `ProxyParser.parse`.

## Design

### 1. Internal Model

Snell joins the existing sing-box-flavored normalized shape used by every other protocol:

```js
{
  tag: string,
  type: 'snell',
  server: string,
  server_port: number,
  psk: string,
  version?: number,        // 1-4, transparent passthrough
  tcp_fast_open?: boolean, // Surge `tfo` / Clash `tfo` (existing field name in this repo)
  reuse?: boolean,         // Surge `reuse` / Clash `reuse` (new field; same name everywhere)
  udp?: boolean,           // Clash-only (Surge has no UDP toggle for Snell)
  obfs?: { type: 'http' | 'tls', host?: string }
}
```

Optional fields are only set when the source provides them; this keeps round-trips lossless and lets builders emit only what was given (consistent with how other protocols treat optional TLS / transport blocks).

### 2. Input

#### 2.1 Surge proxy line — extend [convertSurgeProxyToObject.js](../../../src/parsers/convertSurgeProxyToObject.js)

Add a new branch alongside the existing protocol cases:

```js
case 'snell':
    return {
        tag,
        type: 'snell',
        server,
        server_port: port,
        psk: params.psk,
        version: params.version !== undefined ? parseInt(params.version) : undefined,
        tcp_fast_open: params.tfo !== undefined ? parseBool(params.tfo) : undefined,
        reuse: params.reuse !== undefined ? parseBool(params.reuse) : undefined,
        obfs: params.obfs ? {
            type: params.obfs,
            host: params['obfs-host'] || undefined
        } : undefined
    };
```

`udp` is not read from Surge (no field exists). `version` is `parseInt`'d but not range-validated — whatever Surge accepts, we accept.

#### 2.2 Clash YAML — extend [convertYamlProxyToObject.js](../../../src/parsers/convertYamlProxyToObject.js)

Add a new case after the existing Hysteria2 block:

```js
case 'snell': {
    const obfsOpts = p['obfs-opts'];
    return {
        tag: p.name,
        type: 'snell',
        server: p.server,
        server_port: parseInt(p.port),
        psk: p.psk,
        version: p.version !== undefined ? parseInt(p.version) : undefined,
        tcp_fast_open: typeof p.tfo !== 'undefined' ? !!p.tfo : undefined,
        reuse: typeof p.reuse !== 'undefined' ? !!p.reuse : undefined,
        udp: typeof p.udp !== 'undefined' ? !!p.udp : undefined,
        obfs: obfsOpts && obfsOpts.mode ? {
            type: obfsOpts.mode,
            host: obfsOpts.host || undefined
        } : undefined
    };
}
```

#### 2.3 `snell://` share-link — new file [src/parsers/protocols/snellParser.js](../../../src/parsers/protocols/snellParser.js)

**Format (tool-internal, documented as such):**

```
snell://<url-encoded-psk>@<host>:<port>?version=<n>&obfs=<http|tls>&obfs-host=<h>&tfo=<bool>&reuse=<bool>&udp=<bool>#<name>
```

All query parameters optional; only `psk` (in user-info) and `host:port` are required. The hash fragment is the node tag (URL-decoded).

Implementation mirrors [hysteria2Parser.js](../../../src/parsers/protocols/hysteria2Parser.js) — uses `parseUrlParams`, `parseServerInfo`, `parseBool` from `src/utils.js`:

```js
import { parseServerInfo, parseUrlParams, parseBool, parseMaybeNumber } from '../../utils.js';

export function parseSnell(url) {
    const { addressPart, params, name } = parseUrlParams(url);
    if (!addressPart.includes('@')) return null;
    const [pskPart, serverInfo] = addressPart.split('@');
    const { host, port } = parseServerInfo(serverInfo);
    const psk = decodeURIComponent(pskPart);
    if (!psk || !host || !port) return null;

    const obfs = params.obfs ? {
        type: params.obfs,
        host: params['obfs-host'] || undefined
    } : undefined;

    return {
        tag: name,
        type: 'snell',
        server: host,
        server_port: port,
        psk,
        version: params.version !== undefined ? parseMaybeNumber(params.version) : undefined,
        tcp_fast_open: params.tfo !== undefined ? parseBool(params.tfo) : undefined,
        reuse: params.reuse !== undefined ? parseBool(params.reuse) : undefined,
        udp: params.udp !== undefined ? parseBool(params.udp) : undefined,
        obfs
    };
}
```

Register in [ProxyParser.js](../../../src/parsers/ProxyParser.js):

```js
import { parseSnell } from './protocols/snellParser.js';
const protocolParsers = {
    // ... existing entries
    snell: parseSnell,
};
```

### 3. Output

#### 3.1 Surge — extend [SurgeConfigBuilder.convertProxy](../../../src/builders/SurgeConfigBuilder.js)

Add a `case 'snell'` before the `default`:

```js
case 'snell':
    surgeProxy = `${proxy.tag} = snell, ${proxy.server}, ${proxy.server_port}, psk=${proxy.psk}`;
    if (proxy.version !== undefined) surgeProxy += `, version=${proxy.version}`;
    if (proxy.obfs?.type) {
        surgeProxy += `, obfs=${proxy.obfs.type}`;
        if (proxy.obfs.host) surgeProxy += `, obfs-host=${proxy.obfs.host}`;
    }
    if (proxy.tcp_fast_open === true) surgeProxy += ', tfo=true';
    if (proxy.reuse === true) surgeProxy += ', reuse=true';
    break;
```

Field order matches Surge documentation conventions. Booleans are only emitted when `true` (Surge defaults are off; emitting `=false` is noise).

#### 3.2 Clash — extend [ClashConfigBuilder.convertProxy](../../../src/builders/ClashConfigBuilder.js)

Add a `case 'snell'` before the `default` to produce a Mihomo-compatible object (the existing `default` cannot be relied on because internal field names differ from Clash's: `server_port` vs `port`, `obfs.type` vs `obfs-opts.mode`):

```js
case 'snell': {
    const obfsOpts = proxy.obfs?.type ? {
        mode: proxy.obfs.type,
        ...(proxy.obfs.host ? { host: proxy.obfs.host } : {})
    } : undefined;
    return {
        name: proxy.tag,
        type: 'snell',
        server: proxy.server,
        port: proxy.server_port,
        psk: proxy.psk,
        ...(proxy.version !== undefined ? { version: proxy.version } : {}),
        ...(obfsOpts ? { 'obfs-opts': obfsOpts } : {}),
        ...(proxy.udp !== undefined ? { udp: !!proxy.udp } : {}),
        ...(proxy.tcp_fast_open !== undefined ? { tfo: !!proxy.tcp_fast_open } : {}),
        ...(proxy.reuse !== undefined ? { reuse: !!proxy.reuse } : {})
    };
}
```

#### 3.3 Sing-Box — extend [SingboxConfigBuilder.convertProxy](../../../src/builders/SingboxConfigBuilder.js)

Sing-Box has no native Snell outbound and JSON config has no comment form. The node must be dropped without entering `outbounds` or any selector group.

Insert at the start of `convertProxy`:

```js
if (proxy.type === 'snell') {
    console.warn(`Snell is not supported by Sing-Box; dropping node "${proxy.tag}"`);
    return null;
}
```

`addProxyToConfig` already runs through `addProxyWithDedup` — it must guard against `null`:

```js
addProxyToConfig(proxy) {
    const converted = this.convertProxy(proxy);
    if (converted == null) return;        // Snell dropped, skip
    this.config.outbounds = this.config.outbounds || [];
    addProxyWithDedup(this.config.outbounds, converted, { /* ... existing config ... */ });
}
```

**Action item for the plan**: trace where `convertProxy` is invoked in the Sing-Box flow (it is not necessarily inside `addProxyToConfig` directly) and add the `null`-skip guard at the actual call site. Clash's `convertProxy` always returns an object in this design, so no Clash-side guard is required.

This means the dropped Snell tag will NOT appear in `getProxyList()` (driver of group membership), so Node Select / Auto Select / country groups correctly omit it.

### 4. Data Flow Examples

**Mixed line-by-line input:**

```
ss://AEAD@host:port#A
snell://hello@1.2.3.4:443?version=4&obfs=http&obfs-host=bing.com#B
vmess://...#C
```

→ `parseSubscriptionContent` does not match the whole text (mixed schemes), falls through to line-by-line in `BaseConfigBuilder.parseCustomItems`. Each line goes via `ProxyParser.parse` → registered scheme parser → internal model.

**Single Snell node, no subscription:**

User pastes either:
```
snell://hello@1.2.3.4:443?version=4&obfs=http&obfs-host=bing.com#MyNode
```
or wraps in `[Proxy]` / `proxies:` block as before.

**Surge subscription containing Snell:**

`http(s)://...` URL → `fetchSubscriptionWithFormat` → content recognized as `surgeConfig` → `parseSurgeIni` → each `[Proxy]` line → `convertSurgeProxyToObject` → internal model (with new `snell` case active).

### 5. Documentation

Add a short Snell section to README (CN + EN) covering:
- Three supported input forms (subscription URL, full Surge / Clash paste, `snell://` share-link)
- The `snell://` URL format (note: tool-internal, not a community standard)
- Output platform support: Surge ✓ native, Clash ✓ native (Mihomo-compatible), Sing-Box ✗ dropped with warning

## Validation

A successful implementation must satisfy:

1. **Round-trip Surge → Surge**: pasted Surge input with a Snell node containing every supported field (`psk`, `version`, `obfs`, `obfs-host`, `tfo`, `reuse`) produces a Surge output line that contains all of those same fields.
2. **Round-trip Clash → Clash**: pasted Clash YAML with `obfs-opts: {mode, host}`, `udp`, `tfo`, `reuse` produces a Clash YAML with the same field shapes.
3. **Cross-format Surge → Clash**: Surge Snell input produces Clash output with `obfs-opts` correctly nested and field names translated.
4. **`snell://` URL parsing**: `snell://psk@host:443?version=4&obfs=http&obfs-host=bing.com&tfo=true&reuse=true&udp=true#Test` produces internal model with all fields populated.
5. **Sing-Box drop**: any input containing Snell, when targeting Sing-Box, produces output where:
   - `outbounds` array contains no entry with `type: 'snell'` and no entry with the dropped node's tag.
   - Selector groups (Node Select / Auto Select / country groups) do not list the dropped tag.
   - A `console.warn` was emitted naming the dropped tag.
6. **Mixed input dispatch**: textarea with `ss://` + `snell://` + `vmess://` lines produces Surge output containing all three node types.
7. **Regression**: existing ss / vmess / vless / trojan / tuic / hysteria2 / anytls outputs are byte-identical to pre-change for the same inputs (no incidental field reordering or comment changes).

## Open Items for the Implementation Plan

- Trace Sing-Box `convertProxy` call site to determine where to insert the `null`-skip guard. Same audit for Clash (so future `null` returns are also tolerated).
- Confirm `parseUrlParams` handles `psk` containing `=` / `&` after URL-decode (the user-info segment is decoded once, before query parsing — should be safe, but verify with a test).
- Decide whether `version` defaults emitted by builders (e.g., when input omits `version`, do we emit `version=4` to match current Surge default, or omit entirely?). **Recommended: omit entirely** — pass-through fidelity over guessing.
