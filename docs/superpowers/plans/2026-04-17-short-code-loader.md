# Short Code Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Load from Code" entry point (left of Paste) in the main input that opens a modal asking for a short code + optional token, authenticates via a new conditional-auth `GET /resolve`, and populates the form from the resolved URL while capturing the token for later overwrite.

**Architecture:** Backend gains a new service method `resolveShortCodeEntry(code)` returning `{q, t, legacy}`; `GET /resolve` uses it to enforce per-entry auth (legacy → anonymous; new-format → token required, must match). Frontend adds modal state/handler in `formLogic.js`, a button + modal in `Form.jsx`, and translations for four locales. The existing paste-short-URL auto-parse branch is removed.

**Tech Stack:** Hono (backend routing), Alpine.js (frontend state), vitest (tests), Tailwind (styles), JSX (templates).

**Spec:** [docs/superpowers/specs/2026-04-17-short-code-loader-design.md](../specs/2026-04-17-short-code-loader-design.md)

---

## File Map

**Backend:**
- Modify: [src/services/shortLinkService.js](../../../src/services/shortLinkService.js) — add `resolveShortCodeEntry`
- Modify: [src/app/createApp.jsx](../../../src/app/createApp.jsx) — rewrite `/resolve` handler (lines 363-392)

**Frontend:**
- Modify: [src/components/formLogic.js](../../../src/components/formLogic.js) — strip short-URL branch from auto-parse, add modal state + `loadFromShortCode()`
- Modify: [src/components/Form.jsx](../../../src/components/Form.jsx) — add Load button in `labelActions`, render modal

**i18n:**
- Modify: [src/i18n/index.js](../../../src/i18n/index.js) — add keys for `zh-CN`, `en-US`, `fa`, `ru`

**Tests:**
- Modify: [test/shortLinkService.test.js](../../../test/shortLinkService.test.js) — cover `resolveShortCodeEntry`
- Modify: [test/worker.test.js](../../../test/worker.test.js) — cover new `/resolve` semantics
- Modify: [test/formLogic.test.js](../../../test/formLogic.test.js) — assert short-URL branch removed; assert new state fields present

**Docs:**
- Modify: [README.md](../../../README.md) — add a "v2.6" breaking-change section mirroring the v2.5 one

---

## Task 1: Service layer — `resolveShortCodeEntry`

**Files:**
- Modify: [src/services/shortLinkService.js](../../../src/services/shortLinkService.js)
- Test: [test/shortLinkService.test.js](../../../test/shortLinkService.test.js)

- [ ] **Step 1.1: Write failing tests**

Append to `test/shortLinkService.test.js` before the closing of the file (after the `ShortLinkService.resolveShortCode` block):

```js
describe('ShortLinkService.resolveShortCodeEntry', () => {
    it('returns null for missing entries', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        expect(await svc.resolveShortCodeEntry('nope')).toBeNull();
    });

    it('returns { q, t: null, legacy: true } for legacy entries', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('foo', '?legacy=1');
        const svc = new ShortLinkService(kv);
        expect(await svc.resolveShortCodeEntry('foo')).toEqual({ q: '?legacy=1', t: null, legacy: true });
    });

    it('returns { q, t, legacy: false } for new-format entries', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        const created = await svc.createShortLink('?url=v1', 'foo', null);
        expect(await svc.resolveShortCodeEntry('foo')).toEqual({
            q: '?url=v1',
            t: created.token,
            legacy: false
        });
    });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
npx vitest run test/shortLinkService.test.js -t 'resolveShortCodeEntry'
```

Expected: 3 failures, `svc.resolveShortCodeEntry is not a function`.

- [ ] **Step 1.3: Implement the method**

In [src/services/shortLinkService.js](../../../src/services/shortLinkService.js), append a new method inside the class, right after `resolveShortCode` (after the closing `}` of `resolveShortCode` at line 85):

```js
    async resolveShortCodeEntry(code) {
        const kv = this.ensureKv();
        const raw = await kv.get(code);
        return this.parseStoredValue(raw);
    }
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
npx vitest run test/shortLinkService.test.js
```

Expected: all tests in the file pass, including the 3 new ones.

- [ ] **Step 1.5: Commit**

```bash
git add src/services/shortLinkService.js test/shortLinkService.test.js
git commit -m "feat(short-link): add resolveShortCodeEntry service method

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Route handler — token-gated `/resolve`

**Files:**
- Modify: [src/app/createApp.jsx:363-392](../../../src/app/createApp.jsx#L363-L392)
- Test: [test/worker.test.js](../../../test/worker.test.js)

- [ ] **Step 2.1: Add new i18n keys for the server-side error messages**

The handler will call `t('missingToken')` and `t('tokenMismatch')`. These don't exist yet in the translation tables. Add them to each locale block in [src/i18n/index.js](../../../src/i18n/index.js) near the existing `shortUrlNotFound` / `missingUrl` keys.

For `zh-CN` block (after `shortUrlNotFound: '短链接未找到',`):

```js
    missingToken: '缺少短码 Token',
    tokenMismatch: '短码 Token 不匹配',
```

For `en-US`:

```js
    missingToken: 'Short code token is required',
    tokenMismatch: 'Short code token does not match',
```

For `fa`:

```js
    missingToken: 'توکن کد کوتاه الزامی است',
    tokenMismatch: 'توکن کد کوتاه مطابقت ندارد',
```

For `ru`:

```js
    missingToken: 'Требуется токен короткого кода',
    tokenMismatch: 'Токен короткого кода не совпадает',
```

Locate each block by searching for the `shortUrlNotFound:` line in that locale and inserting the two keys immediately after.

- [ ] **Step 2.2: Write failing route-handler tests**

Append to `test/worker.test.js`, inside the `describe('Worker', ...)` block, right before the closing `});` (after the `/b/:code` redirect test at line 177):

```js
    it('GET /resolve legacy entry returns originalUrl without token', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('legacy1', '?config=abc');
        const app = createTestApp({ kv });
        const res = await app.request('http://localhost/resolve?url=' + encodeURIComponent('http://localhost/b/legacy1'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.originalUrl).toBe('http://localhost/singbox?config=abc');
    });

    it('GET /resolve legacy entry ignores any provided token', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('legacy1', '?config=abc');
        const app = createTestApp({ kv });
        const res = await app.request('http://localhost/resolve?url=' + encodeURIComponent('http://localhost/b/legacy1'), {
            headers: { 'X-Shortlink-Token': 'anything' }
        });
        expect(res.status).toBe(200);
    });

    it('GET /resolve new-format entry without token returns 401 missing', async () => {
        const app = createTestApp();
        const shorten = await app.request('http://localhost/shorten-v2?url=' + encodeURIComponent('http://localhost/singbox?config=xyz') + '&shortCode=new1');
        expect(shorten.status).toBe(200);
        const res = await app.request('http://localhost/resolve?url=' + encodeURIComponent('http://localhost/b/new1'));
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.reason).toBe('missing');
    });

    it('GET /resolve new-format entry with wrong token returns 403 mismatch', async () => {
        const app = createTestApp();
        await app.request('http://localhost/shorten-v2?url=' + encodeURIComponent('http://localhost/singbox?config=xyz') + '&shortCode=new1');
        const res = await app.request('http://localhost/resolve?url=' + encodeURIComponent('http://localhost/b/new1'), {
            headers: { 'X-Shortlink-Token': 'wrong' }
        });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.reason).toBe('mismatch');
    });

    it('GET /resolve new-format entry with correct token returns originalUrl', async () => {
        const app = createTestApp();
        const r = await app.request('http://localhost/shorten-v2?url=' + encodeURIComponent('http://localhost/singbox?config=xyz') + '&shortCode=new1');
        const { token } = await r.json();
        const res = await app.request('http://localhost/resolve?url=' + encodeURIComponent('http://localhost/b/new1'), {
            headers: { 'X-Shortlink-Token': token }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.originalUrl).toBe('http://localhost/singbox?config=xyz');
    });

    it('GET /resolve unknown code returns 404', async () => {
        const app = createTestApp();
        const res = await app.request('http://localhost/resolve?url=' + encodeURIComponent('http://localhost/b/nope'));
        expect(res.status).toBe(404);
    });

    it('GET /resolve without url query returns 400', async () => {
        const app = createTestApp();
        const res = await app.request('http://localhost/resolve');
        expect(res.status).toBe(400);
    });
```

- [ ] **Step 2.3: Run the new tests to verify they fail**

```bash
npx vitest run test/worker.test.js -t '/resolve'
```

Expected: most will fail. The legacy-with-token test will also fail (currently `/resolve` ignores the header but returns 200 — verify actual output). The 401 and 403 tests will definitely fail (current handler returns 200 unconditionally for any entry).

- [ ] **Step 2.4: Rewrite the `/resolve` handler**

In [src/app/createApp.jsx](../../../src/app/createApp.jsx), replace the block from line 363 (`app.get('/resolve', ...)` to the closing `});` at line 392) with:

```jsx
    app.get('/resolve', async (c) => {
        try {
            const shortUrl = c.req.query('url');
            const t = c.get('t');
            if (!shortUrl) return c.text(t('missingUrl'), 400);

            let urlObj;
            try {
                urlObj = new URL(shortUrl);
            } catch {
                return c.text(t('invalidShortUrl'), 400);
            }
            const pathParts = urlObj.pathname.split('/');
            if (pathParts.length < 3) return c.text(t('invalidShortUrl'), 400);

            const prefix = pathParts[1];
            const shortCode = pathParts[2];
            if (!['b', 'c', 'x', 's'].includes(prefix)) return c.text(t('invalidShortUrl'), 400);

            const shortLinks = requireShortLinkService(services.shortLinks);
            const entry = await shortLinks.resolveShortCodeEntry(shortCode);
            if (!entry) return c.text(t('shortUrlNotFound'), 404);

            if (!entry.legacy) {
                const providedToken = getRequestHeader(c.req, 'X-Shortlink-Token') || null;
                if (!providedToken) {
                    return c.json({ error: t('missingToken'), reason: 'missing' }, 401);
                }
                if (providedToken !== entry.t) {
                    return c.json({ error: t('tokenMismatch'), reason: 'mismatch' }, 403);
                }
            }

            const mapping = { b: 'singbox', c: 'clash', x: 'xray', s: 'surge' };
            const originalUrl = `${urlObj.origin}/${mapping[prefix]}${entry.q}`;
            return c.json({ originalUrl });
        } catch (error) {
            return handleError(c, error, runtime.logger);
        }
    });
```

- [ ] **Step 2.5: Run tests to verify they pass**

```bash
npx vitest run test/worker.test.js
```

Expected: all tests pass including the 7 new `/resolve` tests. Also re-run the short-link service tests to confirm nothing regressed:

```bash
npx vitest run test/shortLinkService.test.js
```

Expected: all pass.

- [ ] **Step 2.6: Commit**

```bash
git add src/app/createApp.jsx src/i18n/index.js test/worker.test.js
git commit -m "feat(api): /resolve requires token for new-format short links

Legacy entries remain anonymously readable; new-format entries with a
stored token now require a matching X-Shortlink-Token header and return
401 (missing) or 403 (mismatch) otherwise.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Frontend — remove paste-short-URL auto-parse branch

**Files:**
- Modify: [src/components/formLogic.js:495-570](../../../src/components/formLogic.js#L495-L570)
- Test: [test/formLogic.test.js](../../../test/formLogic.test.js)

- [ ] **Step 3.1: Write failing test asserting the branch is gone**

Append to `test/formLogic.test.js`, inside the `describe('formLogic toString fix', ...)` block (before its closing `});`):

```js
  it('no longer contains the short-URL auto-parse branch', () => {
    const fnString = formLogicFn.toString();
    // The short-URL branch was identified by this regex on pathname.
    expect(fnString).not.toMatch(/\/\^\\\/\(\[bcxs\]\)\\\/\(\[a-zA-Z0-9_-\]\+\)\$/);
    // And by the call to /resolve from auto-parse.
    expect(fnString).not.toContain("fetch(`/resolve?url=${encodeURIComponent(text)}`)");
  });
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
npx vitest run test/formLogic.test.js -t 'no longer contains the short-URL'
```

Expected: FAIL — both regex/substring are still present in the source.

- [ ] **Step 3.3: Remove the short-URL branch from `isSubscriptionUrl`**

In [src/components/formLogic.js](../../../src/components/formLogic.js), replace the `isSubscriptionUrl` method (lines 496-520) with:

```js
            // Check if input looks like a full subscription URL (not a short URL).
            isSubscriptionUrl(text) {
                if (text.includes('\n')) {
                    return false;
                }

                try {
                    const url = new URL(text);
                    const fullMatch = url.pathname.match(/^\/(singbox|clash|xray|surge)$/);
                    return !!(fullMatch && url.search);
                } catch {
                    return false;
                }
            },
```

- [ ] **Step 3.4: Remove the short-URL branch from `tryParseSubscriptionUrl`**

Replace the `tryParseSubscriptionUrl` method (lines 523-570) with:

```js
            // Try to parse a full subscription URL (short URLs are no longer auto-resolved).
            async tryParseSubscriptionUrl(text) {
                if (!this.isSubscriptionUrl(text)) {
                    return;
                }

                this.parsingUrl = true;
                try {
                    let urlToParse;
                    try {
                        urlToParse = new URL(text);
                    } catch {
                        return;
                    }

                    this.populateFormFromUrl(urlToParse);

                    const message = window.APP_TRANSLATIONS?.urlParsedSuccess || '已成功解析订阅链接配置';
                    console.log(message);
                } catch (error) {
                    console.error('Error parsing subscription URL:', error);
                } finally {
                    this.parsingUrl = false;
                }
            },
```

- [ ] **Step 3.5: Run tests to verify they pass**

```bash
npx vitest run test/formLogic.test.js
```

Expected: all tests pass, including the new one.

- [ ] **Step 3.6: Commit**

```bash
git add src/components/formLogic.js test/formLogic.test.js
git commit -m "refactor(frontend): remove short-URL auto-parse from paste handler

Pasting a short link URL (e.g. /b/abc) into the input textarea no longer
auto-resolves it. Loading a short link is now done through an explicit
entry point (added in a later commit).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend — modal state & `loadFromShortCode()`

**Files:**
- Modify: [src/components/formLogic.js](../../../src/components/formLogic.js)
- Test: [test/formLogic.test.js](../../../test/formLogic.test.js)

- [ ] **Step 4.1: Write failing tests for new state fields and method**

Append to `test/formLogic.test.js`, inside the `describe('formLogic toString fix', ...)` block (before its closing `});`):

```js
  it('exposes modal state and loadFromShortCode handler', () => {
    const fakeWindow = { APP_TRANSLATIONS: {}, PREDEFINED_RULE_SETS: {} };
    const fn = new Function('window', '(' + formLogicFn.toString() + ')(); return window;');
    const result = fn(fakeWindow);
    const data = result.formData();
    expect(data.showLoadModal).toBe(false);
    expect(data.loadCodeInput).toBe('');
    expect(data.loadTokenInput).toBe('');
    expect(data.loadingFromCode).toBe(false);
    expect(data.loadError).toBe('');
    expect(typeof data.loadFromShortCode).toBe('function');
    expect(typeof data.openLoadModal).toBe('function');
    expect(typeof data.closeLoadModal).toBe('function');
  });
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
npx vitest run test/formLogic.test.js -t 'exposes modal state'
```

Expected: FAIL — fields are undefined.

- [ ] **Step 4.3: Add state fields to the returned Alpine data object**

In [src/components/formLogic.js](../../../src/components/formLogic.js), inside the object returned at the end of `window.formData = function ()` (around line 72-116, where fields like `customShortCode`, `shortCodeToken` are declared), add the following fields after `issuedShortCodeToken: ''`:

```js
            showLoadModal: false,
            loadCodeInput: '',
            loadTokenInput: '',
            loadingFromCode: false,
            loadError: '',
```

- [ ] **Step 4.4: Add the three new methods**

In the same returned object, append the following methods. Place them after the existing `populateFormFromUrl` method (which is the last method before the closing `}` of the returned object):

```js
            openLoadModal() {
                this.showLoadModal = true;
                this.loadCodeInput = '';
                this.loadTokenInput = '';
                this.loadError = '';
            },

            closeLoadModal() {
                this.showLoadModal = false;
                this.loadError = '';
            },

            async loadFromShortCode() {
                const code = this.loadCodeInput.trim();
                const token = this.loadTokenInput.trim();
                if (!code) {
                    this.loadError = window.APP_TRANSLATIONS?.loadShortCodeMissingFields || 'Short code is required';
                    return;
                }

                this.loadingFromCode = true;
                this.loadError = '';
                try {
                    const origin = window.location.origin;
                    const shortUrl = origin + '/b/' + encodeURIComponent(code);
                    const headers = token ? { 'X-Shortlink-Token': token } : {};
                    const response = await fetch('/resolve?url=' + encodeURIComponent(shortUrl), { headers });

                    if (response.status === 401) {
                        this.loadError = window.APP_TRANSLATIONS?.loadShortCodeMissingToken || 'Token required';
                        return;
                    }
                    if (response.status === 403) {
                        this.loadError = window.APP_TRANSLATIONS?.loadShortCodeTokenMismatch || 'Token does not match';
                        return;
                    }
                    if (response.status === 404) {
                        this.loadError = window.APP_TRANSLATIONS?.loadShortCodeNotFound || 'Short code not found';
                        return;
                    }
                    if (!response.ok) {
                        this.loadError = window.APP_TRANSLATIONS?.loadShortCodeFailed || 'Failed to load';
                        return;
                    }

                    const data = await response.json();
                    if (!data || !data.originalUrl) {
                        this.loadError = window.APP_TRANSLATIONS?.loadShortCodeFailed || 'Failed to load';
                        return;
                    }

                    this.populateFormFromUrl(new URL(data.originalUrl));
                    this.customShortCode = code;
                    this.shortCodeToken = token;
                    this.showLoadModal = false;
                } catch (error) {
                    console.error('Error loading from short code:', error);
                    this.loadError = window.APP_TRANSLATIONS?.loadShortCodeFailed || 'Failed to load';
                } finally {
                    this.loadingFromCode = false;
                }
            },
```

- [ ] **Step 4.5: Wire new translation keys into the inline script payload**

The server-side JSX stringifies translations into `window.APP_TRANSLATIONS` via the `translations` object in [src/components/Form.jsx:19-43](../../../src/components/Form.jsx#L19-L43). Add the following keys inside that object (after `showFullLinks: t('showFullLinks')`, keeping the trailing comma correct):

```js
    loadFromShortCode: t('loadFromShortCode'),
    loadShortCodeTitle: t('loadShortCodeTitle'),
    loadShortCodeCodePlaceholder: t('loadShortCodeCodePlaceholder'),
    loadShortCodeTokenPlaceholder: t('loadShortCodeTokenPlaceholder'),
    loadShortCodeMissingFields: t('loadShortCodeMissingFields'),
    loadShortCodeMissingToken: t('loadShortCodeMissingToken'),
    loadShortCodeTokenMismatch: t('loadShortCodeTokenMismatch'),
    loadShortCodeNotFound: t('loadShortCodeNotFound'),
    loadShortCodeFailed: t('loadShortCodeFailed'),
    cancel: t('cancel'),
    load: t('load')
```

Note: the actual i18n entries for these keys are added in Task 6.

- [ ] **Step 4.6: Run tests to verify the state test passes**

```bash
npx vitest run test/formLogic.test.js
```

Expected: all tests pass.

- [ ] **Step 4.7: Commit**

```bash
git add src/components/formLogic.js src/components/Form.jsx test/formLogic.test.js
git commit -m "feat(frontend): add loadFromShortCode handler and modal state

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Frontend UI — Load button + modal markup

**Files:**
- Modify: [src/components/Form.jsx](../../../src/components/Form.jsx)

- [ ] **Step 5.1: Insert the Load button in the input `labelActions`**

In [src/components/Form.jsx](../../../src/components/Form.jsx), locate the main input `TextareaWithActions` (starting at line 59). The `labelActions` array currently has `paste` and `clear` (lines 73-99). Insert a new entry as the **first** element of the array (before the `paste` entry), matching the primary-colored hover style used by Paste:

```jsx
            {
              key: 'loadFromShortCode',
              icon: 'fas fa-cloud-download-alt',
              label: t('loadFromShortCode'),
              hideLabelOnMobile: true,
              className:
                'px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex items-center gap-1',
              title: t('loadFromShortCode'),
              attrs: {
                'x-on:click': 'openLoadModal()'
              }
            },
```

- [ ] **Step 5.2: Add the modal markup**

In the same file, locate the closing `</div>` of the `x-data="formData()"` wrapper (the outermost `<div>` opened at line 54). The script tag sits immediately before it at line 472. Insert the modal markup **immediately before the `<script>` tag**:

```jsx
      {/* Load from Short Code Modal */}
      <div
        x-cloak
        x-show="showLoadModal"
        {...{
          'x-on:keydown.escape.window': 'closeLoadModal()',
          'x-transition:enter': 'transition ease-out duration-200',
          'x-transition:enter-start': 'opacity-0',
          'x-transition:enter-end': 'opacity-100',
          'x-transition:leave': 'transition ease-in duration-150',
          'x-transition:leave-start': 'opacity-100',
          'x-transition:leave-end': 'opacity-0'
        }}
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        x-on:click.self="closeLoadModal()"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-6"
          x-on:click.stop
        >
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <i class="fas fa-cloud-download-alt text-primary-500"></i>
            {t('loadShortCodeTitle')}
          </h3>

          <div class="space-y-3">
            <input
              type="text"
              x-model="loadCodeInput"
              placeholder={t('loadShortCodeCodePlaceholder')}
              class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
            />
            <input
              type="text"
              x-model="loadTokenInput"
              placeholder={t('loadShortCodeTokenPlaceholder')}
              class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 font-mono text-sm"
            />
            <div
              x-show="loadError"
              x-cloak
              class="text-sm text-red-500 flex items-center gap-1"
            >
              <i class="fas fa-exclamation-circle"></i>
              <span x-text="loadError"></span>
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-3">
            <button
              type="button"
              x-on:click="closeLoadModal()"
              class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium text-sm"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              x-on:click="loadFromShortCode()"
              x-bind:disabled="loadingFromCode"
              class="px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white rounded-lg font-medium text-sm shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <i class="fas" x-bind:class="loadingFromCode ? 'fa-spinner fa-spin' : 'fa-cloud-download-alt'"></i>
              <span>{t('load')}</span>
            </button>
          </div>
        </div>
      </div>
```

- [ ] **Step 5.3: Verify JSX parses by running the test suite**

```bash
npm test -- --run
```

Expected: all tests pass. Vitest will fail with a parse error if the JSX is malformed.

- [ ] **Step 5.4: Commit**

```bash
git add src/components/Form.jsx
git commit -m "feat(frontend): add Load-from-Code button and modal UI

Button appears left of Paste in the main input's hover actions; opens
a modal for short code + optional token, then populates the form on
success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: i18n — add translation keys

**Files:**
- Modify: [src/i18n/index.js](../../../src/i18n/index.js)

- [ ] **Step 6.1: Add keys to `zh-CN` block**

Locate the `zh-CN:` block (starting at line 6). Find `paste: '粘贴',` (line 40). Add the following keys immediately after the existing `paste` / `clear` (or anywhere in the block; grouping near `shortCodeToken:` around line 153 keeps related strings together). Insert after the last `shortCodeToken*` key:

```js
    loadFromShortCode: '从短码加载',
    loadShortCodeTitle: '从短码加载配置',
    loadShortCodeCodePlaceholder: '短码',
    loadShortCodeTokenPlaceholder: 'Token（可选）',
    loadShortCodeMissingFields: '请填写短码',
    loadShortCodeMissingToken: '此短码需要 Token',
    loadShortCodeTokenMismatch: 'Token 不正确',
    loadShortCodeNotFound: '未找到该短码',
    loadShortCodeFailed: '加载失败，请重试',
    cancel: '取消',
    load: '加载',
```

- [ ] **Step 6.2: Add keys to `en-US` block**

Locate the `en-US:` block (line 174). Mirror the placement: after the last `shortCodeToken*` English key:

```js
    loadFromShortCode: 'Load from Code',
    loadShortCodeTitle: 'Load configuration from short code',
    loadShortCodeCodePlaceholder: 'Short code',
    loadShortCodeTokenPlaceholder: 'Token (optional)',
    loadShortCodeMissingFields: 'Short code is required',
    loadShortCodeMissingToken: 'This short code requires a token',
    loadShortCodeTokenMismatch: 'Token does not match',
    loadShortCodeNotFound: 'Short code not found',
    loadShortCodeFailed: 'Failed to load. Please try again.',
    cancel: 'Cancel',
    load: 'Load',
```

- [ ] **Step 6.3: Add keys to `fa` block**

Locate the `fa:` block (line 341). After the last `shortCodeToken*` Farsi key:

```js
    loadFromShortCode: 'بارگذاری از کد',
    loadShortCodeTitle: 'بارگذاری پیکربندی از کد کوتاه',
    loadShortCodeCodePlaceholder: 'کد کوتاه',
    loadShortCodeTokenPlaceholder: 'توکن (اختیاری)',
    loadShortCodeMissingFields: 'کد کوتاه الزامی است',
    loadShortCodeMissingToken: 'این کد کوتاه نیاز به توکن دارد',
    loadShortCodeTokenMismatch: 'توکن مطابقت ندارد',
    loadShortCodeNotFound: 'کد کوتاه یافت نشد',
    loadShortCodeFailed: 'بارگذاری ناموفق بود. دوباره تلاش کنید.',
    cancel: 'انصراف',
    load: 'بارگذاری',
```

- [ ] **Step 6.4: Add keys to `ru` block**

Locate the `ru:` block (line 502). After the last `shortCodeToken*` Russian key:

```js
    loadFromShortCode: 'Загрузить по коду',
    loadShortCodeTitle: 'Загрузить конфигурацию по короткому коду',
    loadShortCodeCodePlaceholder: 'Короткий код',
    loadShortCodeTokenPlaceholder: 'Токен (необязательно)',
    loadShortCodeMissingFields: 'Короткий код обязателен',
    loadShortCodeMissingToken: 'Этот код требует токен',
    loadShortCodeTokenMismatch: 'Токен не совпадает',
    loadShortCodeNotFound: 'Короткий код не найден',
    loadShortCodeFailed: 'Не удалось загрузить. Попробуйте ещё раз.',
    cancel: 'Отмена',
    load: 'Загрузить',
```

- [ ] **Step 6.5: Run tests**

```bash
npx vitest run
```

Expected: all tests pass. This is primarily a sanity check that the JS file parses correctly after the insertions.

- [ ] **Step 6.6: Commit**

```bash
git add src/i18n/index.js
git commit -m "feat(i18n): add translations for short-code loader UI

Covers zh-CN, en-US, fa, ru for the new Load-from-Code button, modal
labels, error messages, and shared cancel/load action labels.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Manual smoke test

**Files:** none (no code changes)

- [ ] **Step 7.1: Start the dev server**

```bash
npm run dev
```

(If `dev` is named differently, check `package.json` scripts — the project is a Cloudflare Worker, likely `wrangler dev` or similar.)

- [ ] **Step 7.2: Verify the Load button appears**

Open the site. Hover over the main input textarea. Confirm three buttons appear in the top-right label row in this order:

1. Load from Code (cloud-download-alt icon)
2. Paste
3. Clear

On mobile-width viewport the labels hide; only icons remain.

- [ ] **Step 7.3: Flow 1 — Load a new-format short code**

1. Paste a real subscription link into the input.
2. Click Convert.
3. In the results section, click Shorten Links. Copy the issued token.
4. Refresh the page (or click Clear All).
5. Click Load from Code. Enter the short code (from the shortened URL). Leave token empty. Click Load.
6. Expect: error message "This short code requires a token" (localized).
7. Enter the wrong token. Click Load. Expect: "Token does not match".
8. Enter the correct token. Click Load. Expect: modal closes, form repopulates with the original subscription, `customShortCode` and `shortCodeToken` in the Shorten section are prefilled.

- [ ] **Step 7.4: Flow 2 — Verify pasting a short URL no longer auto-loads**

1. Click Clear All.
2. Paste the short URL (e.g. `https://<host>/b/<code>`) directly into the main input textarea.
3. Expect: nothing happens — the URL sits in the input, no auto-parse, no network calls to `/resolve`.

- [ ] **Step 7.5: Flow 3 — Legacy entry (if a legacy short link is available for testing)**

If a known legacy short code exists in KV:

1. Click Load from Code. Enter the legacy code. Leave token empty. Click Load.
2. Expect: modal closes, form repopulates, no error. The `shortCodeToken` field remains empty.

If no legacy entry is available, this flow can be skipped — the unit test in Task 2 covers it.

- [ ] **Step 7.6: Cancel / Escape**

1. Click Load from Code. Press Escape. Expect: modal closes.
2. Click Load from Code. Click the backdrop. Expect: modal closes.
3. Click Load from Code. Click Cancel. Expect: modal closes.

---

## Task 8: Document breaking change

**Files:**
- Modify: [README.md](../../../README.md)

- [ ] **Step 8.1: Add a v2.6 section**

In [README.md](../../../README.md), find the existing `## 🔐 Short Link Token Authentication (v2.5+)` section. Insert a new section **immediately after** it (before `## ⭐ Star History`):

```markdown
## 🔐 Short Code Loader + Read Authentication (v2.6+)

Building on v2.5's token system:

- **New UI entry point**: a "Load from Code" button appears to the left of Paste/Clear on the main input. It opens a modal accepting a short code and optional token, then loads the original subscription configuration back into the form and captures the token so a subsequent "Shorten" call overwrites the same short code.
- **`/resolve` is now conditionally authenticated**: entries created under v2.5+ require the matching `X-Shortlink-Token` header. Missing token → 401 (reason `missing`). Wrong token → 403 (reason `mismatch`). Legacy entries (created before v2.5) remain anonymously readable.
- **Auto-parse of pasted short URLs has been removed**. Pasting a short URL (e.g. `https://<host>/b/<code>`) into the main input textarea no longer fetches and populates the form. Use the new "Load from Code" button instead.
- **`/b/:code`, `/c/:code`, `/x/:code`, `/s/:code` redirect endpoints are unchanged** — they continue to resolve anonymously so existing short links on the open internet keep working.

Migration: any external tooling that called `/resolve` on a new-format short code must now supply `X-Shortlink-Token`.
```

- [ ] **Step 8.2: Commit**

```bash
git add README.md
git commit -m "docs: document short-code loader and /resolve auth change in v2.6

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Final Verification

- [ ] **Step F.1: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass. Confirm the new suites (`resolveShortCodeEntry`, the 7 `/resolve` route tests, the 2 new `formLogic` tests) appear in the output.

- [ ] **Step F.2: Inspect git log**

```bash
git log --oneline -10
```

Expected to see these 7 new commits in order on top of the history:

1. `feat(short-link): add resolveShortCodeEntry service method`
2. `feat(api): /resolve requires token for new-format short links`
3. `refactor(frontend): remove short-URL auto-parse from paste handler`
4. `feat(frontend): add loadFromShortCode handler and modal state`
5. `feat(frontend): add Load-from-Code button and modal UI`
6. `feat(i18n): add translations for short-code loader UI`
7. `docs: document short-code loader and /resolve auth change in v2.6`
