# Short Link Token Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a per-short-code token to overwrite an existing short link, preventing unauthorized clobbering of custom short codes.

**Architecture:** Single-key JSON wrapper `{ q, t }` in KV. New format coexists with legacy raw-query-string values and is detected by first character. A new HTTP header `X-Shortlink-Token` carries the token on update. `/shorten-v2` responds with JSON `{ code, token }`.

**Tech Stack:** Hono (router), Vitest (tests), `crypto.getRandomValues` (Web Crypto — available in Cloudflare Workers, Node 19+, browsers), Alpine.js (frontend), Tailwind (styles).

**Reference spec:** [docs/superpowers/specs/2026-04-14-short-link-token-auth-design.md](../specs/2026-04-14-short-link-token-auth-design.md)

**Test runner:** `npm test -- --run` (single run, no watch). For a single file: `npm test -- --run test/<file>.test.js`. For a specific test: add `-t "substring"`.

---

## Task 1: Add `TokenMismatchError` error class

**Files:**
- Modify: `src/services/errors.js`
- Test: `test/shortLinkService.test.js` (new)

- [ ] **Step 1: Create failing test file**

Create `test/shortLinkService.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { TokenMismatchError } from '../src/services/errors.js';

describe('TokenMismatchError', () => {
    it('is a 403 error carrying a reason', () => {
        const err = new TokenMismatchError('token required', 'missing');
        expect(err.status).toBe(403);
        expect(err.reason).toBe('missing');
        expect(err.message).toBe('token required');
        expect(err.name).toBe('TokenMismatchError');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: FAIL with "does not provide an export named 'TokenMismatchError'".

- [ ] **Step 3: Add the error class**

Append to `src/services/errors.js`:

```js
export class TokenMismatchError extends ServiceError {
    constructor(message = 'Token mismatch', reason = 'mismatch') {
        super(message, 403);
        this.name = 'TokenMismatchError';
        this.reason = reason;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/services/errors.js test/shortLinkService.test.js
git commit -m "feat(errors): add TokenMismatchError for short link auth"
```

---

## Task 2: Add `generateToken` helper on the service

**Files:**
- Modify: `src/services/shortLinkService.js`
- Test: `test/shortLinkService.test.js`

- [ ] **Step 1: Append failing test**

Append to `test/shortLinkService.test.js`:

```js
import { ShortLinkService } from '../src/services/shortLinkService.js';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

describe('ShortLinkService.generateToken', () => {
    it('returns a 32-char hex string of cryptographic randomness', () => {
        const svc = new ShortLinkService(new MemoryKVAdapter());
        const a = svc.generateToken();
        const b = svc.generateToken();
        expect(a).toMatch(/^[0-9a-f]{32}$/);
        expect(b).toMatch(/^[0-9a-f]{32}$/);
        expect(a).not.toBe(b);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: FAIL — `svc.generateToken is not a function`.

- [ ] **Step 3: Add the method**

In `src/services/shortLinkService.js`, add a method inside the `ShortLinkService` class:

```js
    generateToken() {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
```

(Note: 32 hex chars = 128 bits of cryptographic entropy. Preferred over base64url because no padding handling is needed; the spec's 32-char requirement is preserved.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/shortLinkService.js test/shortLinkService.test.js
git commit -m "feat(short-link): add generateToken helper"
```

---

## Task 3: Parse and serialize the JSON storage format (with legacy detection)

**Files:**
- Modify: `src/services/shortLinkService.js`
- Test: `test/shortLinkService.test.js`

- [ ] **Step 1: Append failing tests**

Append to `test/shortLinkService.test.js`:

```js
describe('ShortLinkService.parseStoredValue', () => {
    const svc = new ShortLinkService(new MemoryKVAdapter());

    it('returns null for null/undefined/empty', () => {
        expect(svc.parseStoredValue(null)).toBeNull();
        expect(svc.parseStoredValue(undefined)).toBeNull();
        expect(svc.parseStoredValue('')).toBeNull();
    });

    it('treats a raw query string (starts with ?) as legacy, no token', () => {
        expect(svc.parseStoredValue('?config=abc')).toEqual({ q: '?config=abc', t: null, legacy: true });
    });

    it('parses new-format JSON into { q, t }', () => {
        const raw = JSON.stringify({ q: '?x=1', t: 'abc' });
        expect(svc.parseStoredValue(raw)).toEqual({ q: '?x=1', t: 'abc', legacy: false });
    });

    it('treats malformed JSON starting with { as legacy (defensive)', () => {
        expect(svc.parseStoredValue('{not-json')).toEqual({ q: '{not-json', t: null, legacy: true });
    });
});

describe('ShortLinkService.serialize', () => {
    const svc = new ShortLinkService(new MemoryKVAdapter());

    it('stores q and t as a JSON object', () => {
        expect(svc.serialize('?x=1', 'abc')).toBe(JSON.stringify({ q: '?x=1', t: 'abc' }));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: FAIL — `parseStoredValue is not a function`.

- [ ] **Step 3: Add the helpers**

In `src/services/shortLinkService.js`, add methods inside the class:

```js
    parseStoredValue(raw) {
        if (raw === null || raw === undefined || raw === '') return null;
        if (typeof raw !== 'string') return null;
        if (raw[0] === '{') {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && typeof parsed.q === 'string' && typeof parsed.t === 'string') {
                    return { q: parsed.q, t: parsed.t, legacy: false };
                }
            } catch (_) { /* fall through to legacy */ }
            return { q: raw, t: null, legacy: true };
        }
        return { q: raw, t: null, legacy: true };
    }

    serialize(q, t) {
        return JSON.stringify({ q, t });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: PASS (all tests including previous).

- [ ] **Step 5: Commit**

```bash
git add src/services/shortLinkService.js test/shortLinkService.test.js
git commit -m "feat(short-link): add storage parse/serialize with legacy detection"
```

---

## Task 4: `createShortLink` — fresh create (no existing entry) returns `{ code, token }`

**Files:**
- Modify: `src/services/shortLinkService.js`
- Test: `test/shortLinkService.test.js`

- [ ] **Step 1: Append failing tests**

Append to `test/shortLinkService.test.js`:

```js
describe('ShortLinkService.createShortLink — fresh create', () => {
    it('generates code+token and stores new-format JSON when no shortCode given', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        const result = await svc.createShortLink('?url=abc', null, null);
        expect(result).toHaveProperty('code');
        expect(result).toHaveProperty('token');
        expect(result.code).toMatch(/^[A-Za-z0-9]{7}$/);
        expect(result.token).toMatch(/^[0-9a-f]{32}$/);
        const stored = await kv.get(result.code);
        expect(JSON.parse(stored)).toEqual({ q: '?url=abc', t: result.token });
    });

    it('accepts a fresh custom shortCode', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        const result = await svc.createShortLink('?url=abc', 'foo', null);
        expect(result.code).toBe('foo');
        expect(result.token).toMatch(/^[0-9a-f]{32}$/);
        const stored = await kv.get('foo');
        expect(JSON.parse(stored)).toEqual({ q: '?url=abc', t: result.token });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: FAIL — existing `createShortLink` returns a string, not `{ code, token }`.

- [ ] **Step 3: Rewrite `createShortLink`**

Replace the existing `createShortLink` method in `src/services/shortLinkService.js` with:

```js
    async createShortLink(queryString, providedCode, providedToken) {
        const kv = this.ensureKv();
        const code = providedCode || generateWebPath();
        const existingRaw = await kv.get(code);
        const existing = this.parseStoredValue(existingRaw);

        // Case: fresh create (no existing entry)
        if (existing === null) {
            const token = this.generateToken();
            await this.writeEntry(code, queryString, token);
            return { code, token };
        }

        // Cases for existing entries — implemented in later tasks.
        throw new Error('unreachable — existing entry handling not yet implemented');
    }

    async writeEntry(code, queryString, token) {
        const kv = this.ensureKv();
        const ttl = this.options.shortLinkTtlSeconds;
        const putOptions = ttl ? { expirationTtl: ttl } : undefined;
        await kv.put(code, this.serialize(queryString, token), putOptions);
    }
```

The top-of-file imports should already include `generateWebPath` from `../utils.js`. Keep `MissingDependencyError`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: PASS (all tests including new ones).

- [ ] **Step 5: Commit**

```bash
git add src/services/shortLinkService.js test/shortLinkService.test.js
git commit -m "feat(short-link): createShortLink returns {code,token} on fresh create"
```

---

## Task 5: `createShortLink` — overwrite with correct token

**Files:**
- Modify: `src/services/shortLinkService.js`
- Test: `test/shortLinkService.test.js`

- [ ] **Step 1: Append failing tests**

Append to `test/shortLinkService.test.js`:

```js
describe('ShortLinkService.createShortLink — overwrite with correct token', () => {
    it('overwrites the query string and keeps the same token', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        const first = await svc.createShortLink('?url=v1', 'foo', null);
        const second = await svc.createShortLink('?url=v2', 'foo', first.token);
        expect(second.code).toBe('foo');
        expect(second.token).toBe(first.token);
        const stored = JSON.parse(await kv.get('foo'));
        expect(stored).toEqual({ q: '?url=v2', t: first.token });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: FAIL — existing `createShortLink` throws "unreachable" on overwrite.

- [ ] **Step 3: Handle the correct-token branch**

In `src/services/shortLinkService.js`, replace the trailing `throw new Error('unreachable...')` in `createShortLink` with:

```js
        // Existing new-format entry: verify token
        if (!existing.legacy) {
            if (providedToken && providedToken === existing.t) {
                await this.writeEntry(code, queryString, existing.t);
                return { code, token: existing.t };
            }
            // Mismatch cases implemented in Task 6
            throw new Error('unreachable — token mismatch handling not yet implemented');
        }

        // Legacy-claim branch implemented in Task 7
        throw new Error('unreachable — legacy claim not yet implemented');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/shortLinkService.js test/shortLinkService.test.js
git commit -m "feat(short-link): allow overwrite when token matches"
```

---

## Task 6: `createShortLink` — reject overwrite without/wrong token

**Files:**
- Modify: `src/services/shortLinkService.js`
- Test: `test/shortLinkService.test.js`

- [ ] **Step 1: Append failing tests**

Append to `test/shortLinkService.test.js`:

```js
import { TokenMismatchError } from '../src/services/errors.js';

describe('ShortLinkService.createShortLink — overwrite auth failures', () => {
    it('throws TokenMismatchError(reason=missing) when no token provided', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        const first = await svc.createShortLink('?url=v1', 'foo', null);
        await expect(svc.createShortLink('?url=v2', 'foo', null))
            .rejects.toMatchObject({ name: 'TokenMismatchError', reason: 'missing', status: 403 });
        // Ensure KV was not overwritten
        const stored = JSON.parse(await kv.get('foo'));
        expect(stored).toEqual({ q: '?url=v1', t: first.token });
    });

    it('throws TokenMismatchError(reason=mismatch) when wrong token provided', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        await svc.createShortLink('?url=v1', 'foo', null);
        await expect(svc.createShortLink('?url=v2', 'foo', 'not-the-token'))
            .rejects.toMatchObject({ name: 'TokenMismatchError', reason: 'mismatch', status: 403 });
    });

    it('throws TokenMismatchError(reason=missing) for empty-string token', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        await svc.createShortLink('?url=v1', 'foo', null);
        await expect(svc.createShortLink('?url=v2', 'foo', ''))
            .rejects.toMatchObject({ name: 'TokenMismatchError', reason: 'missing' });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: FAIL — throws generic Error, not TokenMismatchError.

- [ ] **Step 3: Implement the mismatch branches**

In `src/services/shortLinkService.js`:

a. Add `TokenMismatchError` to the existing import from `./errors.js`:

```js
import { MissingDependencyError, TokenMismatchError } from './errors.js';
```

b. Replace the `throw new Error('unreachable — token mismatch handling not yet implemented');` line with:

```js
            if (!providedToken) {
                throw new TokenMismatchError('A token is required to overwrite this short link', 'missing');
            }
            throw new TokenMismatchError('Provided token does not match this short link', 'mismatch');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/shortLinkService.js test/shortLinkService.test.js
git commit -m "feat(short-link): reject overwrite when token is missing or wrong"
```

---

## Task 7: `createShortLink` — claim flow for legacy entries

**Files:**
- Modify: `src/services/shortLinkService.js`
- Test: `test/shortLinkService.test.js`

- [ ] **Step 1: Append failing test**

Append to `test/shortLinkService.test.js`:

```js
describe('ShortLinkService.createShortLink — legacy claim', () => {
    it('upgrades a legacy (tokenless) entry with a fresh token regardless of input token', async () => {
        const kv = new MemoryKVAdapter();
        // Pre-seed KV with a legacy value (raw query string starting with ?)
        await kv.put('foo', '?legacy=yes');
        const svc = new ShortLinkService(kv);
        const result = await svc.createShortLink('?url=new', 'foo', null);
        expect(result.code).toBe('foo');
        expect(result.token).toMatch(/^[0-9a-f]{32}$/);
        const stored = JSON.parse(await kv.get('foo'));
        expect(stored).toEqual({ q: '?url=new', t: result.token });
    });

    it('claim ignores any provided token (legacy has no token to match)', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('foo', '?legacy=yes');
        const svc = new ShortLinkService(kv);
        const result = await svc.createShortLink('?url=new', 'foo', 'random-input');
        expect(result.token).not.toBe('random-input');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: FAIL — throws "unreachable — legacy claim".

- [ ] **Step 3: Implement legacy claim**

In `src/services/shortLinkService.js`, replace the `throw new Error('unreachable — legacy claim not yet implemented');` with:

```js
        // Legacy entry: first caller claims it with a newly minted token
        const token = this.generateToken();
        await this.writeEntry(code, queryString, token);
        return { code, token };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/shortLinkService.js test/shortLinkService.test.js
git commit -m "feat(short-link): first caller claims legacy entries with fresh token"
```

---

## Task 8: `resolveShortCode` handles both legacy and new formats

**Files:**
- Modify: `src/services/shortLinkService.js`
- Test: `test/shortLinkService.test.js`

- [ ] **Step 1: Append failing tests**

Append to `test/shortLinkService.test.js`:

```js
describe('ShortLinkService.resolveShortCode', () => {
    it('returns the raw query string for legacy entries', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('foo', '?legacy=1');
        const svc = new ShortLinkService(kv);
        expect(await svc.resolveShortCode('foo')).toBe('?legacy=1');
    });

    it('returns the query string for new-format entries (strips JSON wrapper)', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        await svc.createShortLink('?url=v1', 'foo', null);
        expect(await svc.resolveShortCode('foo')).toBe('?url=v1');
    });

    it('returns null for missing entries', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        expect(await svc.resolveShortCode('does-not-exist')).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: FAIL — `resolveShortCode` currently returns the raw stored string, so the new-format test gets the JSON wrapper back.

- [ ] **Step 3: Update `resolveShortCode`**

In `src/services/shortLinkService.js`, replace the existing `resolveShortCode` method with:

```js
    async resolveShortCode(code) {
        const kv = this.ensureKv();
        const raw = await kv.get(code);
        const parsed = this.parseStoredValue(raw);
        return parsed ? parsed.q : null;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run test/shortLinkService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/shortLinkService.js test/shortLinkService.test.js
git commit -m "feat(short-link): resolveShortCode returns query for both storage formats"
```

---

## Task 9: `/shorten-v2` endpoint — JSON response and header-based auth

**Files:**
- Modify: `src/app/createApp.jsx:303-323`
- Test: `test/worker.test.js` (new tests appended)

- [ ] **Step 1: Append failing tests to `test/worker.test.js`**

Append, inside the existing `describe('Worker', ...)` block (before its closing `});`), the following tests:

```js
    it('GET /shorten-v2 returns JSON { code, token } for fresh create', async () => {
        const app = createTestApp();
        const url = 'http://example.com/clash?config=abc';
        const res = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json();
        expect(body.code).toMatch(/^[A-Za-z0-9]{7}$/);
        expect(body.token).toMatch(/^[0-9a-f]{32}$/);
    });

    it('GET /shorten-v2 with custom shortCode (fresh) returns that code + token', async () => {
        const app = createTestApp();
        const url = 'http://example.com/clash?config=abc';
        const res = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}&shortCode=mycode`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.code).toBe('mycode');
        expect(body.token).toMatch(/^[0-9a-f]{32}$/);
    });

    it('GET /shorten-v2 overwriting existing code without token returns 403', async () => {
        const app = createTestApp();
        const url = 'http://example.com/clash?config=abc';
        // Create first
        const r1 = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}&shortCode=mycode`);
        const token = (await r1.json()).token;
        expect(token).toBeTruthy();
        // Try to overwrite without header
        const r2 = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url + '2')}&shortCode=mycode`);
        expect(r2.status).toBe(403);
        const body = await r2.json();
        expect(body.error).toBeTruthy();
        expect(body.reason).toBe('missing');
    });

    it('GET /shorten-v2 overwriting with wrong token returns 403', async () => {
        const app = createTestApp();
        const url = 'http://example.com/clash?config=abc';
        await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}&shortCode=mycode`);
        const r2 = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url + '2')}&shortCode=mycode`, {
            headers: { 'X-Shortlink-Token': 'nope' }
        });
        expect(r2.status).toBe(403);
        const body = await r2.json();
        expect(body.reason).toBe('mismatch');
    });

    it('GET /shorten-v2 overwriting with correct token succeeds and keeps token stable', async () => {
        const app = createTestApp();
        const url = 'http://example.com/clash?config=abc';
        const r1 = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}&shortCode=mycode`);
        const token = (await r1.json()).token;
        const r2 = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url + '2')}&shortCode=mycode`, {
            headers: { 'X-Shortlink-Token': token }
        });
        expect(r2.status).toBe(200);
        const body = await r2.json();
        expect(body.code).toBe('mycode');
        expect(body.token).toBe(token);
    });

    it('GET /shorten-v2 claiming a legacy entry returns a fresh token', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('legacycode', '?legacy=1'); // simulate pre-migration value
        const app = createTestApp({ kv });
        const url = 'http://example.com/clash?config=abc';
        const res = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}&shortCode=legacycode`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.code).toBe('legacycode');
        expect(body.token).toMatch(/^[0-9a-f]{32}$/);
    });

    it('GET /b/:code still redirects for both legacy and new-format entries', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('legacy1', '?config=abc'); // legacy
        const app = createTestApp({ kv });
        // new format via API
        const r1 = await app.request(`http://localhost/shorten-v2?url=http%3A%2F%2Fx.test%2Fsingbox%3Fconfig%3Ddef&shortCode=new1`);
        expect(r1.status).toBe(200);

        const res1 = await app.request('http://localhost/b/legacy1');
        expect(res1.status).toBe(302);
        expect(res1.headers.get('location')).toBe('http://localhost/singbox?config=abc');

        const res2 = await app.request('http://localhost/b/new1');
        expect(res2.status).toBe(302);
        expect(res2.headers.get('location')).toBe('http://localhost/singbox?config=def');
    });
```

- [ ] **Step 2: Update the existing `GET /shorten-v2 returns short code` test**

Locate `test/worker.test.js:80-93` and replace the body of that test with a minimal JSON assertion (the old assertion checked `await res.text()` and a kv mock that doesn't hold state, which is incompatible with the new flow):

```js
    it('GET /shorten-v2 returns JSON with code on success', async () => {
        const app = createTestApp();
        const url = 'http://example.com';
        const res = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json();
        expect(body.code).toBeTruthy();
        expect(body.token).toBeTruthy();
    });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- --run test/worker.test.js`
Expected: FAIL — `/shorten-v2` still returns `text/plain` and the status/structure assertions break.

- [ ] **Step 4: Update the route**

In `src/app/createApp.jsx`, replace the `app.get('/shorten-v2', ...)` handler at lines 303–323 with:

```jsx
    app.get('/shorten-v2', async (c) => {
        try {
            const url = c.req.query('url');
            if (!url) {
                return c.json({ error: 'Missing URL parameter' }, 400);
            }
            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            } catch {
                return c.json({ error: 'Invalid URL parameter' }, 400);
            }
            const queryString = parsedUrl.search;

            const shortLinks = requireShortLinkService(services.shortLinks);
            const providedCode = c.req.query('shortCode');
            const providedToken = getRequestHeader(c.req, 'X-Shortlink-Token') || null;
            const { code, token } = await shortLinks.createShortLink(queryString, providedCode, providedToken);
            return c.json({ code, token });
        } catch (error) {
            if (error && error.name === 'TokenMismatchError') {
                return c.json({ error: error.message, reason: error.reason }, 403);
            }
            return handleError(c, error, runtime.logger);
        }
    });
```

Notes:
- `getRequestHeader` is defined at `src/app/createApp.jsx:490` and already used for `Accept-Language`, `User-Agent`, etc. Reuse it directly.
- The existing error shape uses `handleError`; keep it as fallback for non-token errors.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run test/worker.test.js`
Expected: PASS (including all previously-passing tests).

- [ ] **Step 6: Run the full suite to catch regressions**

Run: `npm test -- --run`
Expected: All tests pass (new shortLinkService + worker + untouched suites).

- [ ] **Step 7: Commit**

```bash
git add src/app/createApp.jsx test/worker.test.js
git commit -m "feat(api): shorten-v2 returns JSON {code,token} with header auth"
```

---

## Task 10: Frontend — collapse 4-call loop into a single API call

**Files:**
- Modify: `src/components/formLogic.js:419-485`
- Test: `test/formLogic.test.js` (check existing expectations)

- [ ] **Step 1: Confirm no existing frontend tests for `shortenLinks`**

`test/formLogic.test.js` does not currently reference `shortenLinks`, `shorten-v2`, or `shortCode` — verified during plan authoring. No existing frontend test expectations need to be updated. The backend contract is covered by the integration tests added in Task 9; this Alpine-bound frontend code is verified manually in Task 14.

- [ ] **Step 2: Replace the `shortenLinks` method body**

In `src/components/formLogic.js`, locate the `shortenLinks` method (around lines 419–485) and replace its body with:

```js
            async shortenLinks() {
                if (this.shortenedLinks) {
                    alert(window.APP_TRANSLATIONS.alreadyShortened);
                    return;
                }
                if (!this.generatedLinks) {
                    return;
                }

                this.shortening = true;
                try {
                    const origin = window.location.origin;
                    // All 4 types (singbox/clash/xray/surge) share the same query string,
                    // so a single backend call is enough. Prefixes are applied locally.
                    const firstType = Object.keys(this.generatedLinks)[0];
                    const representativeUrl = this.generatedLinks[firstType];
                    const customCode = this.customShortCode.trim();
                    const providedToken = this.shortCodeToken.trim();

                    let apiUrl = origin + '/shorten-v2?url=' + encodeURIComponent(representativeUrl);
                    if (customCode) {
                        apiUrl += '&shortCode=' + encodeURIComponent(customCode);
                    }
                    const headers = {};
                    if (providedToken) {
                        headers['X-Shortlink-Token'] = providedToken;
                    }

                    const response = await fetch(apiUrl, { headers });
                    const body = await response.json().catch(() => ({}));

                    if (!response.ok) {
                        const msg = body.error || window.APP_TRANSLATIONS.shortenFailed;
                        alert(msg);
                        return;
                    }

                    const { code, token } = body;
                    this.issuedShortCodeToken = token;

                    const prefixMap = { singbox: 'b', clash: 'c', xray: 'x', surge: 's' };
                    const shortened = {};
                    for (const type of Object.keys(this.generatedLinks)) {
                        shortened[type] = origin + '/' + prefixMap[type] + '/' + code;
                    }
                    this.shortenedLinks = shortened;
                } catch (error) {
                    console.error('Error shortening links:', error);
                    alert(window.APP_TRANSLATIONS.shortenFailed);
                } finally {
                    this.shortening = false;
                }
            },
```

- [ ] **Step 3: Declare the new reactive properties**

In `src/components/formLogic.js`, inside the `formData()` returned object (near `customShortCode: ''` at line 106), add:

```js
            shortCodeToken: '',
            issuedShortCodeToken: '',
```

Also, in the `clearAll` method around line 345–352, add resets for both:

```js
            this.shortCodeToken = '';
            this.issuedShortCodeToken = '';
```

Place these alongside the existing `this.customShortCode = '';` reset.

- [ ] **Step 4: Run the full suite**

Run: `npm test -- --run`
Expected: All tests pass. No new unit test added for the frontend here; the API contract is covered by `test/worker.test.js`.

- [ ] **Step 5: Commit**

```bash
git add src/components/formLogic.js
git commit -m "feat(frontend): collapse shortenLinks to single API call with token support"
```

---

## Task 11: Frontend — token input and issued-token display in Form.jsx

**Files:**
- Modify: `src/components/Form.jsx:388-422`

- [ ] **Step 1: Add a token input field and issued-token display**

In `src/components/Form.jsx`, inside the "Shortening Controls" block (starting at line 388), replace the `<div class="mt-6">...</div>` block that contains the custom short code input and the shorten button with:

```jsx
      {/* Shortening Controls */}
      <div class="mt-6">
        <div class="flex flex-col items-center gap-3">
          <div class="w-full max-w-md">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">
              {t('customShortCode')} <span class="text-gray-400">({t('optional')})</span>
            </label>
            <input
              type="text"
              x-model="customShortCode"
              placeholder={t('customShortCodePlaceholder')}
              class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 text-center"
            />
          </div>
          <div class="w-full max-w-md">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">
              {t('shortCodeToken')} <span class="text-gray-400">({t('optional')})</span>
            </label>
            <input
              type="text"
              x-model="shortCodeToken"
              placeholder={t('shortCodeTokenPlaceholder')}
              class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 text-center font-mono text-sm"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
              {t('shortCodeTokenHelp')}
            </p>
          </div>
        </div>
        <div class="flex justify-center mt-4">
          <button
            type="button"
            x-on:click="shortenedLinks ? shortenedLinks = null : shortenLinks()"
            x-bind:disabled="!shortenedLinks && shortening"
            class="px-6 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg"
            x-bind:class="shortenedLinks
              ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm'
              : 'bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white shadow-primary-500/30 hover:shadow-primary-500/40 disabled:opacity-50 disabled:cursor-not-allowed'"
          >
            <i
              class="fas"
              x-bind:class="shortenedLinks ? 'fa-expand-alt' : (shortening ? 'fa-spinner fa-spin' : 'fa-compress-alt')"
            ></i>
            <span
              x-text="shortenedLinks ? showFullLinksText : (shortening ? shorteningText : shortenLinksText)"
            ></span>
          </button>
        </div>

        {/* Issued token display: only appears after a successful shorten with a token */}
        <div x-show="issuedShortCodeToken" class="mt-6 max-w-2xl mx-auto">
          <div class="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg p-4">
            <p class="text-sm font-medium text-amber-900 dark:text-amber-100 mb-2">
              {t('shortCodeTokenIssuedTitle')}
            </p>
            <p class="text-xs text-amber-800 dark:text-amber-200 mb-3">
              {t('shortCodeTokenIssuedHelp')}
            </p>
            <div class="flex items-center gap-2">
              <input
                type="text"
                x-bind:value="issuedShortCodeToken"
                readonly
                class="flex-1 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm select-all"
              />
              <button
                type="button"
                x-on:click="navigator.clipboard.writeText(issuedShortCodeToken); copied = 'token'; setTimeout(() => copied = '', 1500)"
                class="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
              >
                <i class="fas" x-bind:class="copied === 'token' ? 'fa-check' : 'fa-copy'"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
```

(This is a full replacement of the existing block. If you diff carefully, only the `{/* Shortening Controls */}` block outer `div` and everything until its matching close is being replaced. Nothing outside that block changes.)

- [ ] **Step 2: Add `copied` to the Form translations JSON passed to the browser**

In `src/components/Form.jsx`, inside the `translations = { ... }` object around line 19, add (if not already present) entries for the new strings:

```js
    shortCodeToken: t('shortCodeToken'),
    shortCodeTokenPlaceholder: t('shortCodeTokenPlaceholder'),
    shortCodeTokenHelp: t('shortCodeTokenHelp'),
    shortCodeTokenIssuedTitle: t('shortCodeTokenIssuedTitle'),
    shortCodeTokenIssuedHelp: t('shortCodeTokenIssuedHelp'),
```

- [ ] **Step 3: Run the build (if available) to confirm JSX compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds. If there's no local build that exercises this file, skip and rely on the test suite + manual browser check.

- [ ] **Step 4: Commit**

```bash
git add src/components/Form.jsx
git commit -m "feat(frontend): add token input and issued-token display for short links"
```

---

## Task 12: i18n strings for the token UI

**Files:**
- Modify: `src/i18n/index.js`

- [ ] **Step 1: Add translations for each locale**

Open `src/i18n/index.js`. Locate each language block (the top-level keys are `'zh-CN'`, `'en'`, `'fa'`, `'ru'`, etc. — find them by searching for existing `shortenLinks` and `customShortCode` entries around lines 48, 211, 367, 523).

For each language, add these 5 keys near the existing `customShortCode*` entries. Use the values below (translate if feasible, otherwise fall back to the English text):

**zh-CN** (around line 150-152):
```js
    shortCodeToken: '短码 Token',
    shortCodeTokenPlaceholder: '覆盖已有短码时填入之前获得的 Token',
    shortCodeTokenHelp: '首次创建新短码时留空;覆盖已存在的短码需要填入当初发放的 Token。',
    shortCodeTokenIssuedTitle: '请妥善保存该 Token',
    shortCodeTokenIssuedHelp: '只有持有此 Token 才能再次修改这个短码对应的链接。丢失后将无法覆盖该短码。',
```

**en** (around line 312-314):
```js
    shortCodeToken: 'Short Code Token',
    shortCodeTokenPlaceholder: 'Paste the token issued when this short code was created',
    shortCodeTokenHelp: 'Leave empty when creating a new short code. Required only to overwrite an existing one.',
    shortCodeTokenIssuedTitle: 'Save this token',
    shortCodeTokenIssuedHelp: 'Only someone holding this token can overwrite this short link later. If you lose it, you can no longer update this short code.',
```

**fa** (around line 468-470) — Persian (you may machine-translate or reuse English):
```js
    shortCodeToken: 'توکن کد کوتاه',
    shortCodeTokenPlaceholder: 'توکن صادرشده هنگام ایجاد این کد کوتاه را وارد کنید',
    shortCodeTokenHelp: 'برای ایجاد کد جدید خالی بگذارید. فقط برای بازنویسی کد موجود لازم است.',
    shortCodeTokenIssuedTitle: 'این توکن را ذخیره کنید',
    shortCodeTokenIssuedHelp: 'فقط دارنده این توکن می‌تواند بعداً این لینک کوتاه را تغییر دهد.',
```

**ru** (around line 624-626) — Russian:
```js
    shortCodeToken: 'Токен короткого кода',
    shortCodeTokenPlaceholder: 'Вставьте токен, выданный при создании этого короткого кода',
    shortCodeTokenHelp: 'Оставьте пустым при создании нового короткого кода. Требуется только для перезаписи существующего.',
    shortCodeTokenIssuedTitle: 'Сохраните этот токен',
    shortCodeTokenIssuedHelp: 'Только обладатель этого токена сможет изменить эту короткую ссылку в будущем.',
```

(If the project includes more locales than listed above, grep for `customShortCode` to locate all locale blocks and add the same 5 keys; use English as the fallback value for any locale you cannot translate.)

- [ ] **Step 2: Manual verification**

Run: `npm test -- --run`
Expected: PASS. (i18n changes do not have unit tests in this project; the test suite should still be green.)

- [ ] **Step 3: Commit**

```bash
git add src/i18n/index.js
git commit -m "feat(i18n): add translations for short-link token UI"
```

---

## Task 13: Update CHANGELOG / README to document the breaking change

**Files:**
- Modify: `README.md` (add a section/note)

- [ ] **Step 1: Locate the API documentation in README.md**

Run: grep `/shorten-v2` in README.md.

```bash
grep -n "shorten-v2\|Short Link\|短链\|短链接" README.md | head -20
```

- [ ] **Step 2: Add an API change note**

In `README.md`, add (near any existing short-link section, or as a new subsection) text equivalent to:

```markdown
## Short Link Token Authentication (v2.5+)

As of v2.5, the `/shorten-v2` endpoint:
- **Response is now JSON** (previously `text/plain`). Shape: `{ "code": "<shortcode>", "token": "<32-hex-token>" }`.
- **Overwriting an existing short code requires** sending the `X-Shortlink-Token: <token>` header. The token is returned exactly once, on creation — save it.
- **Legacy short links** (created before this version) are tokenless. The first caller who references such a short code will claim it and receive a fresh token; after that, subsequent overwrites require that token.
- **403 responses** are returned (JSON `{ error, reason }` with `reason` being `missing` or `mismatch`) when authorization fails.

Migration: external scripts that read `/shorten-v2` response as text must parse JSON and handle the new `token` field.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document short-link token auth breaking change in v2.5"
```

---

## Task 14: Manual smoke test in a real browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Wrangler starts, serves on a local port (typically 8787).

- [ ] **Step 2: Exercise the happy path**

1. Open the dev URL, paste a valid subscription source, click Convert to generate full links.
2. Enter a custom short code like `test-token-1` and click "Generate Short Links".
3. Confirm:
   - 4 shortened URLs appear (singbox/clash/xray/surge), all with the same code.
   - A "Save this token" box appears with a 32-hex token.
   - All 4 short URLs redirect correctly when clicked.

- [ ] **Step 3: Exercise the overwrite-without-token path**

1. Clear the shortened state, keep the same short code `test-token-1` in the custom field, leave the token field blank.
2. Click "Generate Short Links" again.
3. Expect: alert with a "token required" message. The existing short link remains unchanged (check by visiting `/b/test-token-1`).

- [ ] **Step 4: Exercise the overwrite-with-token path**

1. Paste the token captured in Step 2 into the token field.
2. Click "Generate Short Links" again.
3. Expect: new set of shortened URLs, same token returned (compare to Step 2).

- [ ] **Step 5: Exercise the legacy-claim path (optional, advanced)**

If you have a locally running Redis or Cloudflare KV with a legacy entry:
1. Seed a key manually with a raw `?config=...` string.
2. Trigger the frontend with that code.
3. Expect: 200 + a fresh token issued.

- [ ] **Step 6: Stop the dev server**

Terminate the Wrangler process.

- [ ] **Step 7: Record results**

If everything works, proceed to the final commit. If any step fails, file it as a bug-fix task and revisit the relevant Task N above.

---

## Task 15: Final full-suite run and cleanup

**Files:** none

- [ ] **Step 1: Run every test**

Run: `npm test -- --run`
Expected: All tests pass.

- [ ] **Step 2: Verify git state is clean**

Run: `git status`
Expected: `working tree clean` with all commits on the branch.

- [ ] **Step 3: Skim diff for leftover debug code**

Run: `git log --oneline main..HEAD` and `git diff main...HEAD --stat` to see all changes.
Expected: Only the intended files are modified. No `console.log`s added by accident.

---

## Verification summary

What the plan implements:

- [x] Spec §"Token generation": server-generated per create → Task 2, 4, 5, 7.
- [x] Spec §"Legacy links": first-caller claim → Task 7, 9 (integration).
- [x] Spec §"Response format": JSON → Task 9.
- [x] Spec §"Token transport": `X-Shortlink-Token` header → Task 9, 10.
- [x] Spec §"KV storage format": single-key JSON + legacy detection → Task 3.
- [x] Spec §"Token strength": 32-char hex (128-bit CSPRNG) → Task 2.
- [x] Spec §"Frontend UX": show once after creation, token input for overwrites → Task 10, 11, 12.
- [x] Spec §"Risks / breaking change": CHANGELOG + README note → Task 13.
- [x] Spec §"Tests": service unit tests + HTTP integration tests + redirect still works for both formats → Tasks 1–9, 15.
