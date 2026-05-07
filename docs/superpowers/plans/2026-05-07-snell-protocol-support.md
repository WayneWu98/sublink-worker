# Snell Protocol Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Snell protocol parsing (Surge proxy line, Clash YAML, custom `snell://` share-link) and emit native Snell in Surge and Clash outputs; drop with warning in Sing-Box.

**Architecture:** Internal model adds `type: 'snell'` with fields `{psk, version?, tcp_fast_open?, reuse?, udp?, obfs?: {type, host}}`. Three input parsers create the shape; Surge/Clash builders translate it to platform-native format; Sing-Box's `convertProxy` returns `null` for Snell — `BaseConfigBuilder.addCustomItems` already null-guards, so the node disappears cleanly from outbounds and selector groups.

**Tech Stack:** vitest (test framework), js-yaml (YAML parsing), no new dependencies.

**Reference spec:** [docs/superpowers/specs/2026-05-07-snell-protocol-support-design.md](../specs/2026-05-07-snell-protocol-support-design.md)

---

## Test Conventions

All tests follow the existing `test/` style (see [test/surge-unsupported-proxy.test.js](../../../test/surge-unsupported-proxy.test.js)):
- ES module imports from `../src/...`
- `describe / it / expect` from `vitest`
- Run a single file: `npx vitest run test/<name>.test.js`
- Run all: `npm test` (or `npx vitest run`)

For parser unit tests, instantiate the parser function directly and assert on the returned object. For builder integration tests, instantiate the builder, call `await builder.build()`, and assert on the resulting string/object.

`SurgeConfigBuilder` constructor signature (from existing tests):
```js
new SurgeConfigBuilder(inputString, selectedRules, customRules, baseConfig, lang, userAgent, groupByCountry)
```
Use `'minimal'` for `selectedRules`, `[]` for `customRules`, `null` for `baseConfig`, `'zh-CN'` for `lang`, `null` for `userAgent`, `false` for `groupByCountry`.

Equivalent positional args apply to `ClashConfigBuilder` and `SingboxConfigBuilder` — match the patterns in [test/clash-builder.test.js](../../../test/clash-builder.test.js) and [test/index.test.js](../../../test/index.test.js).

---

## Task 1: `snell://` share-link parser

**Files:**
- Create: `src/parsers/protocols/snellParser.js`
- Modify: `src/parsers/ProxyParser.js`
- Test: `test/snell-share-link.test.js`

- [ ] **Step 1.1: Write the failing test**

Create `test/snell-share-link.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseSnell } from '../src/parsers/protocols/snellParser.js';

describe('parseSnell', () => {
    it('parses a full snell:// URL with all params', () => {
        const url = 'snell://hello@1.2.3.4:443?version=4&obfs=http&obfs-host=bing.com&tfo=true&reuse=true&udp=true#MyNode';
        const result = parseSnell(url);
        expect(result).toEqual({
            tag: 'MyNode',
            type: 'snell',
            server: '1.2.3.4',
            server_port: 443,
            psk: 'hello',
            version: 4,
            tcp_fast_open: true,
            reuse: true,
            udp: true,
            obfs: { type: 'http', host: 'bing.com' }
        });
    });

    it('parses minimal snell:// URL (psk + host:port only)', () => {
        const result = parseSnell('snell://abc@example.com:443#Plain');
        expect(result).toEqual({
            tag: 'Plain',
            type: 'snell',
            server: 'example.com',
            server_port: 443,
            psk: 'abc',
            version: undefined,
            tcp_fast_open: undefined,
            reuse: undefined,
            udp: undefined,
            obfs: undefined
        });
    });

    it('URL-decodes the psk', () => {
        // psk "p@ss/key" → URL-encoded as p%40ss%2Fkey
        const result = parseSnell('snell://p%40ss%2Fkey@host:443#N');
        expect(result.psk).toBe('p@ss/key');
    });

    it('omits obfs.host when only obfs is provided', () => {
        const result = parseSnell('snell://abc@host:443?obfs=tls#N');
        expect(result.obfs).toEqual({ type: 'tls', host: undefined });
    });

    it('returns null when missing user-info segment (no psk)', () => {
        expect(parseSnell('snell://host:443#N')).toBeNull();
    });

    it('parses tfo=false correctly', () => {
        const result = parseSnell('snell://abc@host:443?tfo=false#N');
        expect(result.tcp_fast_open).toBe(false);
    });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
npx vitest run test/snell-share-link.test.js
```
Expected: FAIL with `Failed to resolve import "../src/parsers/protocols/snellParser.js"`.

- [ ] **Step 1.3: Create the parser**

Create `src/parsers/protocols/snellParser.js`:

```js
import { parseServerInfo, parseUrlParams, parseBool, parseMaybeNumber } from '../../utils.js';

export function parseSnell(url) {
    const { addressPart, params, name } = parseUrlParams(url);
    if (!addressPart || !addressPart.includes('@')) return null;

    const atIndex = addressPart.lastIndexOf('@');
    const pskPart = addressPart.slice(0, atIndex);
    const serverInfo = addressPart.slice(atIndex + 1);
    const { host, port } = parseServerInfo(serverInfo);

    let psk;
    try {
        psk = decodeURIComponent(pskPart);
    } catch (_) {
        psk = pskPart;
    }
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

- [ ] **Step 1.4: Run test to verify it passes**

```bash
npx vitest run test/snell-share-link.test.js
```
Expected: PASS — all 6 tests green.

- [ ] **Step 1.5: Register parser in ProxyParser**

Modify `src/parsers/ProxyParser.js` — add the import and registration:

```js
import { parseShadowsocks } from './protocols/shadowsocksParser.js';
import { parseVmess } from './protocols/vmessParser.js';
import { parseVless } from './protocols/vlessParser.js';
import { parseHysteria2 } from './protocols/hysteria2Parser.js';
import { parseTrojan } from './protocols/trojanParser.js';
import { parseTuic } from './protocols/tuicParser.js';
import { parseSnell } from './protocols/snellParser.js';
import { fetchSubscription } from './subscription/httpSubscriptionFetcher.js';

const protocolParsers = {
    ss: parseShadowsocks,
    vmess: parseVmess,
    vless: parseVless,
    hysteria: parseHysteria2,
    hysteria2: parseHysteria2,
    hy2: parseHysteria2,
    http: fetchSubscription,
    https: fetchSubscription,
    trojan: parseTrojan,
    tuic: parseTuic,
    snell: parseSnell
};
```

- [ ] **Step 1.6: Add registration test**

Append to `test/snell-share-link.test.js`:

```js
import { ProxyParser } from '../src/parsers/index.js';

describe('ProxyParser routing', () => {
    it('dispatches snell:// to the snell parser', async () => {
        const result = await ProxyParser.parse('snell://abc@example.com:443?version=4#R');
        expect(result).not.toBeUndefined();
        expect(result.type).toBe('snell');
        expect(result.tag).toBe('R');
        expect(result.version).toBe(4);
    });
});
```

- [ ] **Step 1.7: Run all snell-share-link tests**

```bash
npx vitest run test/snell-share-link.test.js
```
Expected: PASS — 7 tests green.

- [ ] **Step 1.8: Commit**

```bash
git add src/parsers/protocols/snellParser.js src/parsers/ProxyParser.js test/snell-share-link.test.js
git commit -m "feat(parsers): add snell:// share-link parser"
```

---

## Task 2: Surge proxy line — Snell case

**Files:**
- Modify: `src/parsers/convertSurgeProxyToObject.js` (after the `tuic` / `hysteria2` cases, before `default`)
- Test: `test/snell-surge-input.test.js`

- [ ] **Step 2.1: Write the failing test**

Create `test/snell-surge-input.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { convertSurgeProxyToObject } from '../src/parsers/convertSurgeProxyToObject.js';

describe('convertSurgeProxyToObject — snell', () => {
    it('parses a full Snell line', () => {
        const line = 'MyNode = snell, 1.2.3.4, 443, psk=hello, version=4, obfs=http, obfs-host=bing.com, tfo=true, reuse=true';
        expect(convertSurgeProxyToObject(line)).toEqual({
            tag: 'MyNode',
            type: 'snell',
            server: '1.2.3.4',
            server_port: 443,
            psk: 'hello',
            version: 4,
            tcp_fast_open: true,
            reuse: true,
            obfs: { type: 'http', host: 'bing.com' }
        });
    });

    it('parses a minimal Snell line (psk only)', () => {
        const line = 'X = snell, host, 443, psk=abc';
        expect(convertSurgeProxyToObject(line)).toEqual({
            tag: 'X',
            type: 'snell',
            server: 'host',
            server_port: 443,
            psk: 'abc',
            version: undefined,
            tcp_fast_open: undefined,
            reuse: undefined,
            obfs: undefined
        });
    });

    it('parses obfs=tls without obfs-host', () => {
        const line = 'X = snell, host, 443, psk=abc, obfs=tls';
        const result = convertSurgeProxyToObject(line);
        expect(result.obfs).toEqual({ type: 'tls', host: undefined });
    });

    it('does not set udp (Surge has no Snell UDP toggle)', () => {
        const result = convertSurgeProxyToObject('X = snell, host, 443, psk=abc');
        expect(result.udp).toBeUndefined();
    });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
npx vitest run test/snell-surge-input.test.js
```
Expected: FAIL — `convertSurgeProxyToObject` returns `null` for snell lines (current default branch).

- [ ] **Step 2.3: Add the snell case**

Modify `src/parsers/convertSurgeProxyToObject.js` — insert the new case after `case 'hysteria2': / case 'hy2':` block and before `case 'http':`:

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

Note: this file's local `parseBool` returns `false` (not `undefined`) for missing values; calling it conditionally on `params.tfo !== undefined` is critical to keep the spec's "only set when present" contract.

- [ ] **Step 2.4: Run test to verify it passes**

```bash
npx vitest run test/snell-surge-input.test.js
```
Expected: PASS — all 4 tests green.

- [ ] **Step 2.5: Commit**

```bash
git add src/parsers/convertSurgeProxyToObject.js test/snell-surge-input.test.js
git commit -m "feat(parsers): support snell in Surge proxy line parser"
```

---

## Task 3: Clash YAML — Snell case

**Files:**
- Modify: `src/parsers/convertYamlProxyToObject.js`
- Test: `test/snell-clash-input.test.js`

- [ ] **Step 3.1: Write the failing test**

Create `test/snell-clash-input.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { convertYamlProxyToObject } from '../src/parsers/convertYamlProxyToObject.js';

describe('convertYamlProxyToObject — snell', () => {
    it('parses a full Snell node with obfs-opts', () => {
        const p = {
            name: 'MyNode',
            type: 'snell',
            server: '1.2.3.4',
            port: 443,
            psk: 'hello',
            version: 4,
            udp: true,
            tfo: true,
            reuse: true,
            'obfs-opts': { mode: 'http', host: 'bing.com' }
        };
        expect(convertYamlProxyToObject(p)).toEqual({
            tag: 'MyNode',
            type: 'snell',
            server: '1.2.3.4',
            server_port: 443,
            psk: 'hello',
            version: 4,
            tcp_fast_open: true,
            reuse: true,
            udp: true,
            obfs: { type: 'http', host: 'bing.com' }
        });
    });

    it('parses a minimal Snell node', () => {
        const p = { name: 'X', type: 'snell', server: 'h', port: 443, psk: 'a' };
        expect(convertYamlProxyToObject(p)).toEqual({
            tag: 'X',
            type: 'snell',
            server: 'h',
            server_port: 443,
            psk: 'a',
            version: undefined,
            tcp_fast_open: undefined,
            reuse: undefined,
            udp: undefined,
            obfs: undefined
        });
    });

    it('omits obfs when obfs-opts is missing', () => {
        const p = { name: 'X', type: 'snell', server: 'h', port: 443, psk: 'a', version: 2 };
        expect(convertYamlProxyToObject(p).obfs).toBeUndefined();
    });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
npx vitest run test/snell-clash-input.test.js
```
Expected: FAIL — `convertYamlProxyToObject` returns `null` for `type: snell` (no case).

- [ ] **Step 3.3: Add the snell case**

Modify `src/parsers/convertYamlProxyToObject.js` — add a new case after the `hysteria2 / hy2` block and before the `default`:

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

- [ ] **Step 3.4: Run test to verify it passes**

```bash
npx vitest run test/snell-clash-input.test.js
```
Expected: PASS — all 3 tests green.

- [ ] **Step 3.5: Commit**

```bash
git add src/parsers/convertYamlProxyToObject.js test/snell-clash-input.test.js
git commit -m "feat(parsers): support snell in Clash YAML parser"
```

---

## Task 4: Surge output — Snell case

**Files:**
- Modify: `src/builders/SurgeConfigBuilder.js` (`convertProxy` switch)
- Test: `test/snell-surge-output.test.js`

- [ ] **Step 4.1: Write the failing integration test**

Create `test/snell-surge-output.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

describe('SurgeConfigBuilder — snell output', () => {
    it('emits a full Snell line in [Proxy]', async () => {
        const input = `snell://hello@1.2.3.4:443?version=4&obfs=http&obfs-host=bing.com&tfo=true&reuse=true#MyNode`;
        const builder = new SurgeConfigBuilder(input, 'minimal', [], null, 'zh-CN', null, false);
        const result = await builder.build();
        const proxySection = result.match(/\[Proxy\]([\s\S]*?)(?=\n\[)/)[1];
        expect(proxySection).toMatch(/MyNode\s*=\s*snell,\s*1\.2\.3\.4,\s*443,\s*psk=hello/);
        expect(proxySection).toContain('version=4');
        expect(proxySection).toContain('obfs=http');
        expect(proxySection).toContain('obfs-host=bing.com');
        expect(proxySection).toContain('tfo=true');
        expect(proxySection).toContain('reuse=true');
    });

    it('emits minimal Snell line when only psk is provided', async () => {
        const input = `snell://abc@host:443#Plain`;
        const builder = new SurgeConfigBuilder(input, 'minimal', [], null, 'zh-CN', null, false);
        const result = await builder.build();
        const proxySection = result.match(/\[Proxy\]([\s\S]*?)(?=\n\[)/)[1];
        expect(proxySection).toMatch(/Plain\s*=\s*snell,\s*host,\s*443,\s*psk=abc/);
        // None of the optional fields should appear
        expect(proxySection).not.toContain('version=');
        expect(proxySection).not.toContain('obfs=');
        expect(proxySection).not.toContain('tfo=');
        expect(proxySection).not.toContain('reuse=');
    });

    it('does NOT emit reuse=false / tfo=false when explicitly false', async () => {
        // Surge defaults are off; emitting =false is noise.
        const input = `snell://abc@host:443?tfo=false&reuse=false#X`;
        const builder = new SurgeConfigBuilder(input, 'minimal', [], null, 'zh-CN', null, false);
        const result = await builder.build();
        const proxySection = result.match(/\[Proxy\]([\s\S]*?)(?=\n\[)/)[1];
        expect(proxySection).not.toContain('tfo=');
        expect(proxySection).not.toContain('reuse=');
    });

    it('Snell node appears in proxy groups (not filtered as comment)', async () => {
        const input = `snell://abc@host:443#NodeA`;
        const builder = new SurgeConfigBuilder(input, 'minimal', [], null, 'zh-CN', null, false);
        const result = await builder.build();
        const groupsSection = result.match(/\[Proxy Group\]([\s\S]*?)(?=\n\[)/)[1];
        expect(groupsSection).toContain('NodeA');
    });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
npx vitest run test/snell-surge-output.test.js
```
Expected: FAIL — Surge builder's default branch emits `# NodeA - Unsupported proxy type: snell`, which is filtered out of groups, so the assertions about a real `MyNode = snell, ...` line and group membership all fail.

- [ ] **Step 4.3: Add Snell case in convertProxy**

Modify `src/builders/SurgeConfigBuilder.js` — insert before the `default:` branch in `convertProxy`:

```js
            case 'snell':
                surgeProxy = `${proxy.tag} = snell, ${proxy.server}, ${proxy.server_port}, psk=${proxy.psk}`;
                if (proxy.version !== undefined) {
                    surgeProxy += `, version=${proxy.version}`;
                }
                if (proxy.obfs?.type) {
                    surgeProxy += `, obfs=${proxy.obfs.type}`;
                    if (proxy.obfs.host) {
                        surgeProxy += `, obfs-host=${proxy.obfs.host}`;
                    }
                }
                if (proxy.tcp_fast_open === true) {
                    surgeProxy += ', tfo=true';
                }
                if (proxy.reuse === true) {
                    surgeProxy += ', reuse=true';
                }
                break;
```

- [ ] **Step 4.4: Run test to verify it passes**

```bash
npx vitest run test/snell-surge-output.test.js
```
Expected: PASS — all 4 tests green.

- [ ] **Step 4.5: Commit**

```bash
git add src/builders/SurgeConfigBuilder.js test/snell-surge-output.test.js
git commit -m "feat(surge): emit native snell proxy lines"
```

---

## Task 5: Clash output — Snell case

**Files:**
- Modify: `src/builders/ClashConfigBuilder.js` (`convertProxy` switch)
- Test: `test/snell-clash-output.test.js`

- [ ] **Step 5.1: Write the failing integration test**

Create `test/snell-clash-output.test.js`:

```js
import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';

function buildClash(input) {
    const builder = new ClashConfigBuilder(input, 'minimal', [], null, 'zh-CN', null, false);
    return builder.build();
}

describe('ClashConfigBuilder — snell output', () => {
    it('emits a Mihomo-shaped Snell node with obfs-opts', async () => {
        const input = `snell://hello@1.2.3.4:443?version=4&obfs=http&obfs-host=bing.com&tfo=true&reuse=true&udp=true#MyNode`;
        const result = await buildClash(input);
        const cfg = yaml.load(result);
        const node = cfg.proxies.find(p => p.name === 'MyNode');
        expect(node).toBeDefined();
        expect(node).toMatchObject({
            name: 'MyNode',
            type: 'snell',
            server: '1.2.3.4',
            port: 443,
            psk: 'hello',
            version: 4,
            udp: true,
            tfo: true,
            reuse: true,
            'obfs-opts': { mode: 'http', host: 'bing.com' }
        });
    });

    it('omits all optional fields for a minimal Snell node', async () => {
        const input = `snell://abc@host:443#Plain`;
        const result = await buildClash(input);
        const cfg = yaml.load(result);
        const node = cfg.proxies.find(p => p.name === 'Plain');
        expect(node).toEqual({
            name: 'Plain',
            type: 'snell',
            server: 'host',
            port: 443,
            psk: 'abc'
        });
    });

    it('emits obfs-opts without host when only mode is provided', async () => {
        const input = `snell://abc@host:443?obfs=tls#X`;
        const result = await buildClash(input);
        const cfg = yaml.load(result);
        const node = cfg.proxies.find(p => p.name === 'X');
        expect(node['obfs-opts']).toEqual({ mode: 'tls' });
    });

    it('Snell node is present in proxy-groups', async () => {
        const input = `snell://abc@host:443#NodeA`;
        const result = await buildClash(input);
        const cfg = yaml.load(result);
        const allGroupMembers = (cfg['proxy-groups'] || []).flatMap(g => g.proxies || []);
        expect(allGroupMembers).toContain('NodeA');
    });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
npx vitest run test/snell-clash-output.test.js
```
Expected: FAIL — Clash builder's `default` branch passes the proxy through, so it would emit fields named `tag`/`server_port`/`obfs.type` which Clash doesn't recognize. The `name`/`port`/`obfs-opts` shape assertions fail.

- [ ] **Step 5.3: Add Snell case in convertProxy**

Modify `src/builders/ClashConfigBuilder.js` — insert a new case before `default:` in `convertProxy`:

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

- [ ] **Step 5.4: Run test to verify it passes**

```bash
npx vitest run test/snell-clash-output.test.js
```
Expected: PASS — all 4 tests green.

- [ ] **Step 5.5: Commit**

```bash
git add src/builders/ClashConfigBuilder.js test/snell-clash-output.test.js
git commit -m "feat(clash): emit native snell proxy nodes"
```

---

## Task 6: Sing-Box drops Snell

**Files:**
- Modify: `src/builders/SingboxConfigBuilder.js` (`convertProxy`)
- Test: `test/snell-singbox-drop.test.js`

Background: [BaseConfigBuilder.js:344-347](../../../src/builders/BaseConfigBuilder.js#L344-L347) already null-guards: `if (convertedProxy) { addProxyToConfig(...) }`. Returning `null` from `convertProxy` is sufficient; the proxy never enters `outbounds` or selector groups.

- [ ] **Step 6.1: Write the failing test**

Create `test/snell-singbox-drop.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';

function buildSingbox(input) {
    // Mirror existing test invocation style — see test/index.test.js.
    const builder = new SingboxConfigBuilder(input, 'minimal', [], null, 'zh-CN', null, false);
    return builder.build();
}

describe('SingboxConfigBuilder — snell drop', () => {
    it('does not emit a snell outbound', async () => {
        const input = `snell://abc@host:443?version=4#NodeA`;
        const cfg = JSON.parse(await buildSingbox(input));
        const snellEntries = cfg.outbounds.filter(o => o.type === 'snell');
        expect(snellEntries).toEqual([]);
    });

    it('does not include the snell tag in any outbound or selector group', async () => {
        const input = `snell://abc@host:443#DroppedTag`;
        const cfg = JSON.parse(await buildSingbox(input));
        // No outbound with that server tag
        expect(cfg.outbounds.some(o => o.tag === 'DroppedTag')).toBe(false);
        // No selector includes that tag
        for (const o of cfg.outbounds) {
            if (Array.isArray(o.outbounds)) {
                expect(o.outbounds).not.toContain('DroppedTag');
            }
        }
    });

    it('warns to console with the dropped node tag', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await buildSingbox(`snell://abc@host:443#WarnTag`);
            const matched = warnSpy.mock.calls.some(args =>
                String(args[0] ?? '').includes('Snell') &&
                String(args.join(' ')).includes('WarnTag')
            );
            expect(matched).toBe(true);
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('keeps non-snell nodes when snell is mixed in', async () => {
        const input = `ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@1.2.3.4:443#KeepMe\nsnell://abc@host:443#Drop`;
        const cfg = JSON.parse(await buildSingbox(input));
        expect(cfg.outbounds.some(o => o.tag === 'KeepMe')).toBe(true);
        expect(cfg.outbounds.some(o => o.tag === 'Drop')).toBe(false);
    });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

```bash
npx vitest run test/snell-singbox-drop.test.js
```
Expected: FAIL — without the drop, sing-box's `convertProxy` returns the proxy as-is. It enters `outbounds` with `type: 'snell'` and the tag appears in selector groups.

- [ ] **Step 6.3: Add the drop in convertProxy**

Modify `src/builders/SingboxConfigBuilder.js` — insert at the very top of `convertProxy`, before the `const sanitized = { ...proxy };` line:

```js
    convertProxy(proxy) {
        if (proxy && proxy.type === 'snell') {
            console.warn(`Snell is not supported by Sing-Box; dropping node "${proxy.tag}"`);
            return null;
        }

        // Create a shallow copy to avoid mutating the original
        const sanitized = { ...proxy };
        // ... existing body unchanged
```

- [ ] **Step 6.4: Run test to verify it passes**

```bash
npx vitest run test/snell-singbox-drop.test.js
```
Expected: PASS — all 4 tests green.

- [ ] **Step 6.5: Commit**

```bash
git add src/builders/SingboxConfigBuilder.js test/snell-singbox-drop.test.js
git commit -m "feat(singbox): drop snell nodes with console warning"
```

---

## Task 7: End-to-end mixed input → all outputs

**Files:**
- Test: `test/snell-e2e.test.js`

This test runs after all per-builder tasks pass; it guards against accidental coupling by exercising the full pipeline with a single shared input.

- [ ] **Step 7.1: Write the test**

Create `test/snell-e2e.test.js`:

```js
import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';

const MIXED_INPUT = [
    'ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@1.2.3.4:443#SS-Node',
    'snell://hello@5.6.7.8:443?version=4&obfs=http&obfs-host=bing.com#Snell-Node',
    'trojan://pwd@9.10.11.12:443?sni=example.com#Trojan-Node'
].join('\n');

describe('Snell end-to-end (mixed input → all outputs)', () => {
    it('Surge output contains all three nodes including Snell', async () => {
        const builder = new SurgeConfigBuilder(MIXED_INPUT, 'minimal', [], null, 'zh-CN', null, false);
        const out = await builder.build();
        const proxySection = out.match(/\[Proxy\]([\s\S]*?)(?=\n\[)/)[1];
        expect(proxySection).toContain('SS-Node');
        expect(proxySection).toMatch(/Snell-Node\s*=\s*snell,/);
        expect(proxySection).toContain('Trojan-Node');
    });

    it('Clash output contains all three nodes with native Snell shape', async () => {
        const builder = new ClashConfigBuilder(MIXED_INPUT, 'minimal', [], null, 'zh-CN', null, false);
        const cfg = yaml.load(await builder.build());
        const names = cfg.proxies.map(p => p.name).sort();
        expect(names).toEqual(['SS-Node', 'Snell-Node', 'Trojan-Node']);
        const snell = cfg.proxies.find(p => p.name === 'Snell-Node');
        expect(snell.type).toBe('snell');
        expect(snell['obfs-opts']).toEqual({ mode: 'http', host: 'bing.com' });
    });

    it('Sing-Box output contains the two non-Snell nodes only', async () => {
        const builder = new SingboxConfigBuilder(MIXED_INPUT, 'minimal', [], null, 'zh-CN', null, false);
        const cfg = JSON.parse(await builder.build());
        const tags = cfg.outbounds.filter(o => o.server).map(o => o.tag).sort();
        expect(tags).toEqual(['SS-Node', 'Trojan-Node']);
    });
});
```

- [ ] **Step 7.2: Run test**

```bash
npx vitest run test/snell-e2e.test.js
```
Expected: PASS — all 3 tests green.

- [ ] **Step 7.3: Run full test suite to catch regressions**

```bash
npm test -- --run
```
Expected: PASS — all pre-existing tests still green (no regressions in ss / vmess / trojan / hysteria2 / tuic / vless / anytls outputs).

If `npm test` runs in watch mode, use `npx vitest run` directly.

- [ ] **Step 7.4: Commit**

```bash
git add test/snell-e2e.test.js
git commit -m "test(snell): end-to-end mixed input across all builders"
```

---

## Task 8: README documentation (CN + EN)

**Files:**
- Modify: `README.md`
- Modify: `README.zh-Hans.md`

- [ ] **Step 8.1: Locate the supported-protocols section in each README**

```bash
grep -n -i "snell\|protocol\|协议\|支持" README.md | head -20
grep -n -i "snell\|protocol\|协议\|支持" README.zh-Hans.md | head -20
```
Identify the section that lists supported input/output protocols and platform feature matrix. If no such section exists, add one near the existing feature list.

- [ ] **Step 8.2: Add a Snell entry (English)**

Add to `README.md` under the supported-protocols section. Suggested text:

```markdown
### Snell

- **Input formats:**
  - Surge config block (paste full text containing `[Proxy]` section)
  - Clash YAML (`type: snell` node, supports `obfs-opts: {mode, host}`)
  - `snell://` share-link — *tool-internal format, not a community standard*. Format:
    ```
    snell://<url-encoded-psk>@<host>:<port>?version=<n>&obfs=<http|tls>&obfs-host=<h>&tfo=<bool>&reuse=<bool>&udp=<bool>#<name>
    ```
    Only `psk` and `host:port` are required. Note: `snell://` URLs from other tools (Surgio, etc.) are not guaranteed to parse — they all use different conventions.
- **Output platforms:**
  - **Surge** ✓ native
  - **Clash (Mihomo)** ✓ native
  - **Sing-Box** ✗ dropped with a console warning (Sing-Box has no native Snell outbound)
```

- [ ] **Step 8.3: Add a Snell entry (Chinese)**

Add to `README.zh-Hans.md` under the equivalent section:

```markdown
### Snell

- **支持输入:**
  - Surge 配置整段(含 `[Proxy]` 段直接粘贴)
  - Clash YAML(`type: snell` 节点,支持 `obfs-opts: {mode, host}`)
  - `snell://` 分享链接 —— *本工具自定义格式,无社区标准*。格式:
    ```
    snell://<url-encoded-psk>@<host>:<port>?version=<n>&obfs=<http|tls>&obfs-host=<h>&tfo=<bool>&reuse=<bool>&udp=<bool>#<name>
    ```
    必填项仅 `psk` 与 `host:port`。注意:别处(Surgio 等)生成的 `snell://` URL 不一定能直接解析,各家约定不同。
- **输出平台:**
  - **Surge** ✓ 原生支持
  - **Clash (Mihomo)** ✓ 原生支持
  - **Sing-Box** ✗ 跳过并在控制台警告(Sing-Box 无原生 Snell 出站)
```

- [ ] **Step 8.4: Commit**

```bash
git add README.md README.zh-Hans.md
git commit -m "docs: document Snell input formats and output platform matrix"
```

---

## Final Verification

- [ ] **Run the full suite once more from a clean state:**

```bash
npx vitest run
```
Expected: ALL tests PASS, including pre-existing ones.

- [ ] **Sanity-check git log:**

```bash
git log --oneline -10
```
You should see 7 new commits (one per task). No squash, no force-push.

- [ ] **Optional manual smoke test (UI):** if the dev server is running, paste the mixed input from Task 7 into the 输入源 textarea and verify each output platform's preview renders the expected content.

---

## Notes for the Implementer

- **Field-naming consistency**: do not invent variants. Internal field is `tcp_fast_open` (existing repo convention), Surge param is `tfo`, Clash param is `tfo`. All three must agree.
- **Optional-field discipline**: `version` / `tcp_fast_open` / `reuse` / `udp` / `obfs` are emitted only when present in the source. Don't synthesize defaults — the user picked passthrough fidelity over guessing.
- **Don't alter `BaseConfigBuilder.addCustomItems`** — it already null-guards, and changing it risks regressions for unrelated builders.
- **Don't add `mptcp` / `interface` / `test-url`** — the spec excludes them. If a future user requests them, reopen the spec.
- **No `snell://` emission**: outputs are config files, never share-link lists. Resist the urge to add a "share Snell as URL" feature.
