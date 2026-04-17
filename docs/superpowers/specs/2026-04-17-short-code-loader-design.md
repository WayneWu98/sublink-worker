# Short Code Loader — Design

**Status:** Draft
**Date:** 2026-04-17

## Problem

Users who have previously created a short link via `/shorten-v2` hold a `{code, token}` pair. To edit the underlying subscription and overwrite the same short code later, they must repopulate the form with the original settings. Today the only way to do this is to paste the full short URL (e.g. `https://host/b/abc`) into the main input textarea and rely on the implicit auto-parse in [src/components/formLogic.js:523-556](../../../src/components/formLogic.js#L523-L556), which calls `/resolve` anonymously. That path:

- Does not capture the token, so the subsequent "shorten" call cannot authenticate and overwrite the existing entry (introduced in the v2.5 token-auth work).
- Is invisible in the UI — users have no discoverable entry point.
- Silently side-effects the input field, which is surprising behavior for a textarea.

## Goal

Give users a visible, explicit entry point to load an existing short link's settings back into the form, and capture the `token` so they can re-shorten to overwrite the same code. Enforce token ownership on the read path for entries that have a token stored.

## Non-Goals

- Listing / browsing a user's past short codes (no account system).
- Token recovery.
- Any change to the `/b/:code`, `/c/:code`, `/x/:code`, `/s/:code` redirect endpoints — they remain anonymously readable so existing short links on the open internet keep working.
- A dedicated "edit mode" UI; the existing form is the editor.

## Decisions Already Made During Brainstorming

1. **Entry point:** A third floating label action on the main input textarea, placed to the **left** of Paste (order: Load → Paste → Clear). Icon `fa-cloud-download-alt`. Opens a modal.
2. **Modal fields:** Short code input (required), Token input (optional — no help text under it). Cancel / Load buttons. Error region for backend errors.
3. **`/resolve` auth model — per-entry conditional:**
   - Legacy entries (stored as raw query string with no token): no token check, anonymous read allowed.
   - New-format entries (stored as `{q, t}`): require `X-Shortlink-Token` header; must match `t` stored in KV, else 403.
4. **Paste-short-link auto-parse is removed** from `formLogic.js`. The only way to load a short link is via the new modal. Full-URL auto-parse (pasting e.g. `https://host/singbox?config=...`) is preserved — it does not hit `/resolve`.
5. **On successful load:** populate form via existing `populateFormFromUrl()`, and also set `customShortCode = code` and `shortCodeToken = token` so that clicking "shorten" again overwrites the same short link.
6. **Breaking change:** `/resolve` semantics change for new-format entries. Documented in `docs/` alongside release notes, in the style of the v2.5 breaking-change note.

## Architecture

### Backend

#### Service layer — [src/services/shortLinkService.js](../../../src/services/shortLinkService.js)

Add a new method that exposes the full parsed entry (query + token + legacy flag):

```js
async resolveShortCodeEntry(code) {
    const kv = this.ensureKv();
    const raw = await kv.get(code);
    return this.parseStoredValue(raw); // {q, t, legacy} | null
}
```

The existing `resolveShortCode(code)` is **not changed** — the `/b/:code` etc. redirect handlers continue to use it and remain token-free.

#### Route handler — [src/app/createApp.jsx:363-392](../../../src/app/createApp.jsx#L363-L392)

Rewrite `GET /resolve`:

1. Parse `url` query param into `{prefix, shortCode}` (same as today).
2. Call `resolveShortCodeEntry(shortCode)`.
3. If null → 404, message `t('shortUrlNotFound')` (unchanged).
4. If `entry.legacy === true` → return `{originalUrl}` (no token check).
5. Else (new-format):
   - Read header `X-Shortlink-Token` via `getRequestHeader(c.req, 'X-Shortlink-Token')`.
   - If absent → 401 JSON `{ error: t('missingToken'), reason: 'missing' }`.
   - If present and `!== entry.t` → 403 JSON `{ error: t('tokenMismatch'), reason: 'mismatch' }`.
   - Else → return `{originalUrl}`.

Response shape on success stays `{ originalUrl }` (unchanged, so any remaining consumers still parse).

### Frontend

#### State additions — [src/components/formLogic.js](../../../src/components/formLogic.js)

New fields in the Alpine `x-data`:

```js
showLoadModal: false,
loadCodeInput: '',
loadTokenInput: '',
loadingFromCode: false,
loadError: '',
```

New method `loadFromShortCode()`:

1. Trim both inputs. If `loadCodeInput` empty → set `loadError` to a translated "code required" message, return.
2. Build `shortUrl = window.location.origin + '/b/' + encodeURIComponent(loadCodeInput)` (the prefix is arbitrary — the backend ignores it beyond validity).
3. Build `fetch('/resolve?url=' + encodeURIComponent(shortUrl), { headers: loadTokenInput ? { 'X-Shortlink-Token': loadTokenInput } : {} })`.
4. Branch on status:
   - 200: parse `{originalUrl}`, call `populateFormFromUrl(new URL(data.originalUrl))`, set `customShortCode = loadCodeInput`, set `shortCodeToken = loadTokenInput` (may be empty for legacy), close modal, reset inputs & error.
   - 401: `loadError = t('loadShortCodeMissingToken')`.
   - 403: `loadError = t('loadShortCodeTokenMismatch')`.
   - 404: `loadError = t('loadShortCodeNotFound')`.
   - other: `loadError = t('loadShortCodeFailed')`.
5. Uses `loadingFromCode` to disable the Load button during the request.

Removal: the short-link branch in `tryParseSubscriptionUrl` (the `shortMatch` block, lines ~538-556) and the `pathMatch` branch in `isSubscriptionUrl` (lines ~504-508). Full-URL handling stays. If both branches removed the helper becomes trivial — keep it as-is or inline; decide during implementation.

#### UI additions — [src/components/Form.jsx](../../../src/components/Form.jsx)

1. In the main input `labelActions` array, insert a new entry as the **first** element:

```js
{
  key: 'loadFromShortCode',
  icon: 'fas fa-cloud-download-alt',
  label: t('loadFromShortCode'),
  hideLabelOnMobile: true,
  className: '<same style family as Paste, using primary hover colors>',
  title: t('loadFromShortCode'),
  attrs: {
    'x-on:click': 'showLoadModal = true; loadError = \'\'; loadCodeInput = \'\'; loadTokenInput = \'\''
  }
}
```

2. At the end of the component, add a modal (`x-show="showLoadModal"`, `x-cloak`, transition classes matching the existing results-panel pattern). Structure:
   - Backdrop (semi-transparent, click to close).
   - Card matching project style (`bg-white dark:bg-gray-800 rounded-2xl shadow-xl`).
   - Title `t('loadShortCodeTitle')`.
   - Short code input bound to `loadCodeInput`, placeholder `t('loadShortCodeCodePlaceholder')`.
   - Token input bound to `loadTokenInput`, placeholder `t('loadShortCodeTokenPlaceholder')`, monospace. **No help text.**
   - Error region (`x-show="loadError"`, red text, `x-text="loadError"`).
   - Cancel button (sets `showLoadModal = false`).
   - Load button (`x-on:click="loadFromShortCode()"`, `x-bind:disabled="loadingFromCode"`, shows spinner when loading).

#### i18n — [src/i18n/index.js](../../../src/i18n/index.js)

Add for every locale (zh-CN, en, fa, ru, and any others present):

- `loadFromShortCode` — button label, e.g. 中文「从短码加载」/ EN "Load from Code"
- `loadShortCodeTitle` — modal heading
- `loadShortCodeCodePlaceholder`
- `loadShortCodeTokenPlaceholder`
- `loadShortCodeMissingFields` — client-side "code is required"
- `loadShortCodeMissingToken` — 401
- `loadShortCodeTokenMismatch` — 403
- `loadShortCodeNotFound` — 404
- `loadShortCodeFailed` — generic
- `cancel`, `load` — reuse if present, else add

Backend error strings (`missingToken`, `tokenMismatch`) already need i18n registration via `c.get('t')` — add them to the server-side translation table if not already there.

## Data Flow

```
User clicks "Load from Code"
  └─► showLoadModal = true
User fills code + (optional) token, clicks Load
  └─► loadFromShortCode()
        ├─► fetch GET /resolve?url=<origin>/b/<code>
        │      header: X-Shortlink-Token (if token provided)
        │
        ├─► Backend: resolveShortCodeEntry(code)
        │     ├─ null → 404
        │     ├─ legacy → return {originalUrl}
        │     └─ new-format → check token → {originalUrl} or 401/403
        │
        ├─► 200: populateFormFromUrl(originalUrl)
        │        customShortCode = code
        │        shortCodeToken = token
        │        close modal
        │
        └─► non-200: set loadError, keep modal open
```

## Error Handling

- **Client validation** — code empty: block before any network call, show translated error in the modal's error region.
- **Network failure** (fetch throws): show `t('loadShortCodeFailed')`.
- **Malformed JSON from server**: treat as generic failure.
- **populateFormFromUrl throws** (e.g. malformed `originalUrl`): wrap the call in try/catch, show `t('loadShortCodeFailed')`, keep modal open.

Modal stays open on any error so the user can correct input without re-entering everything.

## Testing

Existing repo uses `vitest` per [vitest.config.js](../../../vitest.config.js). Testing plan:

1. **Service layer** — extend `test/` coverage for `shortLinkService`:
   - `resolveShortCodeEntry` returns `null` for missing key.
   - Returns `{q, t, legacy: false}` for new-format entries.
   - Returns `{q, t: null, legacy: true}` for legacy entries.
2. **Route handler** — add tests for `GET /resolve`:
   - Legacy entry, no header → 200 with originalUrl.
   - Legacy entry, with header → 200 (header ignored).
   - New entry, no header → 401, reason `missing`.
   - New entry, wrong header → 403, reason `mismatch`.
   - New entry, correct header → 200.
   - Unknown code → 404.
   - Invalid URL param → 400 (preserve existing behavior).
3. **Frontend `formLogic` behavior** — if the project tests any `formData()` helpers (check during implementation), add or update:
   - `isSubscriptionUrl` no longer matches `/b/abc` style paths.
   - `tryParseSubscriptionUrl` no longer calls `/resolve`.

No end-to-end UI test framework is present, so the modal UI itself is verified manually against the running dev server.

## Migration / Breaking Changes

This is a **v2.6 breaking change** for two behaviors:

1. **`/resolve` endpoint**: new-format entries now require `X-Shortlink-Token`. Anonymous reads of new entries return 401/403. Legacy entries remain anonymously readable.
2. **Paste-to-load**: pasting a short URL (e.g. `https://host/b/abc`) into the main input textarea no longer auto-populates the form. Users must use the new "Load from Code" button.

Both are documented in:

- The spec (this file).
- A new section in the existing `docs/` changelog / breaking-change note (mirror the style of commit `cd04b1d docs: document short-link token auth breaking change in v2.5`).
- Release notes for v2.6.

## Open Questions

None. All raised during brainstorming are resolved.
