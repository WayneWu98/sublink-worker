# Surge `#!MANAGED-CONFIG` Short-URL Preservation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Surge client subscribes via a short link (`/s/:code`), bake the short URL (not the long converter URL) into the `#!MANAGED-CONFIG` directive of the returned config, so the client stays pinned to the short link and automatically picks up future short-code remaps.

**Architecture:** Two small changes in [src/app/createApp.jsx](../../../src/app/createApp.jsx): (1) the `/s/:code` redirect handler appends `&sub_url=<encoded short url>` to the redirect target; (2) the `/surge` handler reads `sub_url`, enforces same-origin, and uses it as the subscription URL (falling back to the request URL stripped of `sub_url`). `SurgeConfigBuilder` already exposes `setSubscriptionUrl` and needs no change.

**Tech Stack:** Hono (routing), Vitest (testing), MemoryKVAdapter (in-test KV stub).

**Spec:** [docs/superpowers/specs/2026-04-20-surge-managed-config-short-url-design.md](../specs/2026-04-20-surge-managed-config-short-url-design.md)

---

## File Structure

| Path | Role | Change |
|---|---|---|
| [src/app/createApp.jsx](../../../src/app/createApp.jsx) | App routes & helpers | Modify `/surge` handler (line 207), `redirectHandler` factory (lines 330-342); add `resolveSurgeSubscriptionUrl` helper near other helpers |
| [src/builders/SurgeConfigBuilder.js](../../../src/builders/SurgeConfigBuilder.js) | Surge config builder | **No change** — `setSubscriptionUrl` already exists |
| `test/surge-managed-config-url.test.js` | New test file | Create — all new tests for this feature |
| [README.md](../../../README.md) | Release notes | Append a v2.7+ subsection matching existing v2.5+/v2.6+ style |

All production code changes live in a single file. Tests go in a dedicated file to keep `worker.test.js` focused.

---

### Task 1: Surge handler — `resolveSurgeSubscriptionUrl` helper

Implement the direct-access side of the feature: honor a same-origin `sub_url` query param when the `/surge` handler runs; otherwise use the request URL with `sub_url` stripped.

**Files:**
- Create: `test/surge-managed-config-url.test.js`
- Modify: [src/app/createApp.jsx](../../../src/app/createApp.jsx) — line 207 (replace `builder.setSubscriptionUrl(c.req.url)`) and add helper near other helpers (bottom of file, alongside `getRequestHeader` etc.)

- [ ] **Step 1: Write the failing tests**

Create `test/surge-managed-config-url.test.js` with:

```js
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

const createTestApp = (overrides = {}) => {
    const runtime = {
        kv: overrides.kv ?? new MemoryKVAdapter(),
        assetFetcher: null,
        logger: console,
        config: {
            configTtlSeconds: 60,
            shortLinkTtlSeconds: null
        }
    };
    return createApp(runtime);
};

// Minimal valid vmess config reused across tests (same pattern as worker.test.js)
const VMESS_CONFIG = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';

const firstManagedConfigUrl = (body) => {
    const line = body.split('\n').find(l => l.startsWith('#!MANAGED-CONFIG'));
    if (!line) return null;
    // Format: #!MANAGED-CONFIG <url> interval=... strict=...
    return line.split(/\s+/)[1];
};

describe('Surge #!MANAGED-CONFIG URL resolution', () => {
    it('direct access without sub_url writes the request URL into MANAGED-CONFIG', async () => {
        const app = createTestApp();
        const res = await app.request(`http://localhost/surge?config=${encodeURIComponent(VMESS_CONFIG)}`);
        expect(res.status).toBe(200);
        const body = await res.text();
        const url = firstManagedConfigUrl(body);
        expect(url).toBe(`http://localhost/surge?config=${encodeURIComponent(VMESS_CONFIG)}`);
    });

    it('direct access with same-origin sub_url writes sub_url into MANAGED-CONFIG', async () => {
        const app = createTestApp();
        const sub = 'http://localhost/s/abc123';
        const res = await app.request(
            `http://localhost/surge?config=${encodeURIComponent(VMESS_CONFIG)}&sub_url=${encodeURIComponent(sub)}`
        );
        expect(res.status).toBe(200);
        const body = await res.text();
        expect(firstManagedConfigUrl(body)).toBe(sub);
    });

    it('direct access with cross-origin sub_url strips it and falls back to request URL', async () => {
        const app = createTestApp();
        const evil = 'https://evil.com/surge';
        const res = await app.request(
            `http://localhost/surge?config=${encodeURIComponent(VMESS_CONFIG)}&sub_url=${encodeURIComponent(evil)}`
        );
        expect(res.status).toBe(200);
        const body = await res.text();
        const url = firstManagedConfigUrl(body);
        expect(url).not.toContain('evil.com');
        expect(url).not.toContain('sub_url');
        expect(url).toContain('http://localhost/surge');
        expect(url).toContain(`config=${encodeURIComponent(VMESS_CONFIG)}`);
    });

    it('direct access with malformed sub_url strips it and falls back', async () => {
        const app = createTestApp();
        const res = await app.request(
            `http://localhost/surge?config=${encodeURIComponent(VMESS_CONFIG)}&sub_url=not-a-url`
        );
        expect(res.status).toBe(200);
        const body = await res.text();
        const url = firstManagedConfigUrl(body);
        expect(url).not.toContain('sub_url');
        expect(url).toContain('http://localhost/surge');
    });

    it('protocol mismatch (https sub_url for http request) is treated as cross-origin', async () => {
        const app = createTestApp();
        const sub = 'https://localhost/s/abc123';
        const res = await app.request(
            `http://localhost/surge?config=${encodeURIComponent(VMESS_CONFIG)}&sub_url=${encodeURIComponent(sub)}`
        );
        expect(res.status).toBe(200);
        const body = await res.text();
        const url = firstManagedConfigUrl(body);
        expect(url).not.toContain('sub_url');
        expect(url).not.toMatch(/^https:/);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/surge-managed-config-url.test.js`

Expected: The first test (no `sub_url`) PASSES (current behavior already writes `c.req.url`). The second, third, fourth, and fifth tests FAIL — `sub_url` is currently ignored, so MANAGED-CONFIG contains the full request URL including the `sub_url` query param literal.

- [ ] **Step 3: Add the `resolveSurgeSubscriptionUrl` helper**

Edit [src/app/createApp.jsx](../../../src/app/createApp.jsx). Add this function near the bottom of the file, next to the other helpers (e.g. just above or below `getRequestHeader`):

```js
function resolveSurgeSubscriptionUrl(req) {
    const reqUrl = new URL(req.url);
    const rawSubUrl = req.query('sub_url');

    if (rawSubUrl) {
        let candidate;
        try {
            candidate = new URL(rawSubUrl);
        } catch {
            candidate = null;
        }
        if (candidate && candidate.origin === reqUrl.origin) {
            return candidate.toString();
        }
    }

    reqUrl.searchParams.delete('sub_url');
    return reqUrl.toString();
}
```

- [ ] **Step 4: Wire the helper into the `/surge` handler**

In [src/app/createApp.jsx](../../../src/app/createApp.jsx), inside `app.get('/surge', ...)`, replace line 207:

```js
builder.setSubscriptionUrl(c.req.url);
```

with:

```js
builder.setSubscriptionUrl(resolveSurgeSubscriptionUrl(c.req));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/surge-managed-config-url.test.js`

Expected: all 5 tests PASS.

Also run the existing suite to confirm no regressions:

Run: `npx vitest run`

Expected: all pre-existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add test/surge-managed-config-url.test.js src/app/createApp.jsx
git commit -m "feat(surge): honor same-origin sub_url in MANAGED-CONFIG"
```

---

### Task 2: Short-code redirect — append `sub_url` for `/s/:code`

Make `/s/:code` forward the original short URL to the Surge handler via the query string so the MANAGED-CONFIG line can reflect it.

**Files:**
- Modify: `test/surge-managed-config-url.test.js` — add redirect-location tests
- Modify: [src/app/createApp.jsx:330-342](../../../src/app/createApp.jsx#L330-L342) — branch `redirectHandler` on `prefix === 'surge'`

- [ ] **Step 1: Write the failing tests**

Append to `test/surge-managed-config-url.test.js`:

```js
describe('/s/:code redirect passes short URL via sub_url', () => {
    it('/s/:code redirect Location preserves original params and appends encoded sub_url', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('abc123', '?config=xyz');
        const app = createTestApp({ kv });
        const res = await app.request('http://localhost/s/abc123');
        expect(res.status).toBe(302);
        const loc = res.headers.get('location');
        expect(loc).toBeTruthy();

        // Location is http://localhost/surge?config=xyz&sub_url=<encoded http://localhost/s/abc123>
        const locUrl = new URL(loc);
        expect(locUrl.origin).toBe('http://localhost');
        expect(locUrl.pathname).toBe('/surge');
        expect(locUrl.searchParams.get('config')).toBe('xyz');
        expect(locUrl.searchParams.get('sub_url')).toBe('http://localhost/s/abc123');
    });

    it('/b/:code redirect Location does NOT include sub_url (Singbox out of scope)', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('abc123', '?config=xyz');
        const app = createTestApp({ kv });
        const res = await app.request('http://localhost/b/abc123');
        expect(res.status).toBe(302);
        const loc = res.headers.get('location');
        expect(new URL(loc).searchParams.has('sub_url')).toBe(false);
    });

    it('/c/:code redirect Location does NOT include sub_url', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('abc123', '?config=xyz');
        const app = createTestApp({ kv });
        const res = await app.request('http://localhost/c/abc123');
        expect(res.status).toBe(302);
        expect(new URL(res.headers.get('location')).searchParams.has('sub_url')).toBe(false);
    });

    it('/x/:code redirect Location does NOT include sub_url', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('abc123', '?config=xyz');
        const app = createTestApp({ kv });
        const res = await app.request('http://localhost/x/abc123');
        expect(res.status).toBe(302);
        expect(new URL(res.headers.get('location')).searchParams.has('sub_url')).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/surge-managed-config-url.test.js -t "/s/:code"`

Expected: the `/s/:code` test FAILS — current Location is `http://localhost/surge?config=xyz` with no `sub_url`. The `/b/`, `/c/`, `/x/` tests PASS (current behavior is already correct for those).

- [ ] **Step 3: Modify the `redirectHandler` factory**

In [src/app/createApp.jsx](../../../src/app/createApp.jsx), replace the existing `redirectHandler` (lines 330-342) with:

```js
const redirectHandler = (prefix) => async (c) => {
    try {
        const code = c.req.param('code');
        const shortLinks = requireShortLinkService(services.shortLinks);
        const originalParam = await shortLinks.resolveShortCode(code);
        if (!originalParam) return c.text('Short URL not found', 404);

        const url = new URL(c.req.url);
        let target = `${url.origin}/${prefix}${originalParam}`;
        if (prefix === 'surge') {
            const shortUrl = `${url.origin}/s/${code}`;
            const separator = originalParam.includes('?') ? '&' : '?';
            target = `${target}${separator}sub_url=${encodeURIComponent(shortUrl)}`;
        }
        return c.redirect(target);
    } catch (error) {
        return handleError(c, error, runtime.logger);
    }
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/surge-managed-config-url.test.js`

Expected: all 9 tests in this file PASS.

Also re-run the redirect regression tests already in `worker.test.js`:

Run: `npx vitest run test/worker.test.js -t "/b/:code still redirects"`

Expected: PASS (behavior for `/b/:code` unchanged).

- [ ] **Step 5: Commit**

```bash
git add test/surge-managed-config-url.test.js src/app/createApp.jsx
git commit -m "feat(surge): /s/:code redirect propagates short URL via sub_url"
```

---

### Task 3: End-to-end redirect-follow test

Lock in the combined behavior: a client that starts at `/s/:code` and follows the 302 receives a config whose MANAGED-CONFIG is the short URL. This test should pass without further code changes; it exists to prevent regressions in either of the two changes above.

**Files:**
- Modify: `test/surge-managed-config-url.test.js` — add one end-to-end test

- [ ] **Step 1: Add the end-to-end test**

Append to `test/surge-managed-config-url.test.js`:

```js
describe('End-to-end: short link → Surge config → MANAGED-CONFIG short URL', () => {
    it('following the /s/:code redirect yields MANAGED-CONFIG pointing at the short URL', async () => {
        const kv = new MemoryKVAdapter();
        // Seed a short code that points to a valid /surge query string.
        await kv.put('abc123', `?config=${encodeURIComponent(VMESS_CONFIG)}`);
        const app = createTestApp({ kv });

        // Step 1: hit /s/abc123, expect 302
        const r1 = await app.request('http://localhost/s/abc123');
        expect(r1.status).toBe(302);
        const location = r1.headers.get('location');
        expect(location).toBeTruthy();

        // Step 2: follow the redirect
        const r2 = await app.request(location);
        expect(r2.status).toBe(200);
        const body = await r2.text();

        // MANAGED-CONFIG should be the short URL, not the long one.
        expect(body).toMatch(/^#!MANAGED-CONFIG http:\/\/localhost\/s\/abc123 interval=/m);
        expect(body).not.toMatch(/#!MANAGED-CONFIG http:\/\/localhost\/surge\?/);
    });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run test/surge-managed-config-url.test.js -t "End-to-end"`

Expected: PASS (no code change needed — Tasks 1 and 2 together produce this behavior).

If it fails, do NOT weaken the test; revisit Task 1 or Task 2 implementation.

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add test/surge-managed-config-url.test.js
git commit -m "test(surge): end-to-end short-link → MANAGED-CONFIG regression guard"
```

---

### Task 4: Release notes in README

Add a short subsection documenting the new behavior and the first-refresh migration caveat for existing short-link subscribers.

**Files:**
- Modify: [README.md](../../../README.md) — insert a new subsection after the v2.6+ block (around line 124), before the `## ⭐ Star History` heading

- [ ] **Step 1: Append the release-notes block**

Insert the following block in [README.md](../../../README.md) immediately after the v2.6+ section (after the line `Migration: any external tooling that called /resolve on a new-format short code must now supply X-Shortlink-Token.`) and before `## ⭐ Star History`:

```markdown
## 🔐 Surge `#!MANAGED-CONFIG` Short-URL Preservation (v2.7+)

Surge responses previously embedded the long converter URL (e.g. `/surge?config=...`) in their `#!MANAGED-CONFIG` directive. As of v2.7:

- When a Surge client subscribes via a short link (`/s/:code`), the returned config's `#!MANAGED-CONFIG` line now points at the **short URL** (e.g. `https://<host>/s/abc123`). The client stays pinned to the short link; subsequent `/shorten-v2` overwrites of the same code are automatically picked up on the next client refresh, with no manual reconfiguration.
- Direct access to `/surge?config=...` (no short link involved) is unchanged — the long request URL is written into `MANAGED-CONFIG`.
- A new optional query parameter `sub_url` is accepted by `/surge`. It must be a **same-origin** absolute URL; cross-origin or malformed values are silently ignored (stripped from the fallback URL) to prevent malicious URL override.

**One-time migration for existing subscribers:** Surge clients already pinned to the long URL (from an earlier build) will not auto-migrate. Re-enter the short URL in Surge once to pick up the new behavior.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: note v2.7+ Surge MANAGED-CONFIG short-URL preservation"
```

---

## Final Verification

- [ ] Run the full test suite one last time: `npx vitest run` — expect all tests green.
- [ ] Review the four commits with `git log --oneline -4` and confirm the sequence reads:
  1. `feat(surge): honor same-origin sub_url in MANAGED-CONFIG`
  2. `feat(surge): /s/:code redirect propagates short URL via sub_url`
  3. `test(surge): end-to-end short-link → MANAGED-CONFIG regression guard`
  4. `docs: note v2.7+ Surge MANAGED-CONFIG short-URL preservation`
- [ ] Visually inspect the modified `redirectHandler` and `/surge` handler to confirm no other prefixes leak `sub_url` and that the fallback path strips `sub_url` from the URL written into MANAGED-CONFIG.
