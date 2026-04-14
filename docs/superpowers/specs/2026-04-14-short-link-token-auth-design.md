# Short Link Token Authentication — Design

**Status:** Draft
**Date:** 2026-04-14

## Problem

The `/shorten-v2` endpoint in [src/app/createApp.jsx:303-323](../../../src/app/createApp.jsx#L303-L323) lets any caller overwrite an existing short link by reusing its `shortCode`. The service layer at [src/services/shortLinkService.js](../../../src/services/shortLinkService.js) calls `kv.put(shortCode, queryString)` with no existence check. This means anyone who knows (or guesses) a custom short code can clobber somebody else's link.

## Goal

Require a per-short-code token to overwrite an existing short link. Only the original creator (or somebody they shared the token with) can replace the target of a short code.

## Non-Goals

- Token revocation / rotation.
- Token recovery ("I lost my token").
- Per-user accounts or API keys.
- Hashing tokens at rest (explicitly chosen: plaintext is acceptable for this threat model).

## Decisions Already Made During Brainstorming

1. **Token generation:** Server-generated on every successful create. Returned to the client once.
2. **Legacy links (no token):** First caller to hit a legacy short code claims it — a fresh token is generated, the link is upgraded to the new storage format, and the token is returned. Documented risk: whoever claims first wins.
3. **Response format:** JSON `{ code, token }` (breaking change from plain text).
4. **Token transport on update:** HTTP header `X-Shortlink-Token: <token>` (not query param, to keep tokens out of logs).
5. **KV storage format:** Single key, JSON-wrapped value `{ "q": "<queryString>", "t": "<token>" }`. Legacy values (raw query strings starting with `?`) are detected on read and treated as tokenless.
6. **Token strength:** 32-character random string (base64url of 24 random bytes), stored in plaintext.
7. **Frontend UX:** Show the token once after creation; user is responsible for saving it. No localStorage caching. An input field lets the user paste a token when they want to overwrite an existing short code.

## Architecture

### Storage format

Single KV key per short code. Value is one of:

- **New format** (has token): JSON object `{ "q": string, "t": string }` — starts with `{`.
- **Legacy format** (pre-migration): raw query string `?...` — starts with `?` (or is empty).

Detection is by first character of the stored string. No migration job; legacy entries are transparently upgraded the next time someone calls `/shorten-v2` with their code.

### Service layer changes

`ShortLinkService` in [src/services/shortLinkService.js](../../../src/services/shortLinkService.js) gains:

- `createShortLink(queryString, providedCode, providedToken)` — now returns `{ code, token }`.
  - If `providedCode` does not exist in KV: generate token, store, return both.
  - If `providedCode` exists and is new-format: verify `providedToken === stored.t`; on mismatch throw a typed error; on match re-write with the new query string, keep the same token.
  - If `providedCode` exists and is legacy-format: generate a new token, overwrite with new-format JSON (claim flow), return both.
  - If `providedCode` is not given: generate a fresh code and token, store, return both.
- `resolveShortCode(code)` — still returns the query string. Internally unwraps JSON if the value is new-format; returns the raw string for legacy values. Callers upstream are unchanged.
- Internal helpers: `generateToken()`, `parseStoredValue(raw)`, `serialize({ q, t })`.
- A new typed error class (e.g. `TokenMismatchError`) in [src/services/errors.js](../../../src/services/errors.js) so the app layer can map it to 403.

### HTTP layer changes

[src/app/createApp.jsx](../../../src/app/createApp.jsx):

- `GET /shorten-v2`:
  - Read optional `shortCode` query param (existing).
  - Read optional `X-Shortlink-Token` request header (new).
  - Call `createShortLink(queryString, shortCode, token)`.
  - On success: respond `200 application/json { code, token }`.
  - On `TokenMismatchError`: respond `403 application/json { error: "token required" | "token mismatch" }`.
  - On other errors: existing `handleError` path.
- Redirect handlers (`/b/:code`, `/c/:code`, `/x/:code`, `/s/:code`) and `/resolve` are unchanged at the call site — `resolveShortCode` continues to return the plain query string.

### Frontend changes

[src/components/formLogic.js:419-485](../../../src/components/formLogic.js#L419-L485):

- Collapse the 4-iteration loop (singbox/clash/xray/surge) into **one** call to `/shorten-v2`. The stored query string is identical for all four types; calling four times is redundant and becomes impossible under the new auth model anyway.
- Parse JSON response; capture `code` + `token`.
- Build the 4 shortened URLs locally with the `prefixMap`.
- After success, display the token to the user in a copyable field, with an explanatory note ("Save this token if you want to modify this short link later").
- Add a new input field (next to `customShortCode`) for pasting a previously issued token. If present, send it as `X-Shortlink-Token` on the next submit.
- On 403 response, surface the server error message in a user-visible alert.

[src/components/Form.jsx](../../../src/components/Form.jsx) and [src/i18n/index.js](../../../src/i18n/index.js):

- Add UI elements for the token input and the post-creation token display.
- Add new translation strings: token label, placeholder, help text, "save this token" notice, 403 error messages.

### Tests

New and updated tests in [test/](../../../test/):

- Service unit tests:
  - Creating a short link returns a non-empty token.
  - Creating with a fresh custom code succeeds and returns a token.
  - Creating with an existing new-format code fails without token, fails with wrong token, succeeds with correct token (and keeps the same token).
  - Creating with an existing legacy-format code (value starts with `?`) claims it: returns a new token and upgrades the stored value.
  - `resolveShortCode` returns the query string for both new-format and legacy values.
- Endpoint tests:
  - `/shorten-v2` returns `application/json` with `code` + `token`.
  - 403 when token header is missing/wrong for an existing new-format code.
  - Redirect handlers still work against both formats.

## Data Flow Scenarios

**Create (no custom code):**
```
GET /shorten-v2?url=...
→ server: code = random(), token = random()
→ KV.put(code, JSON{q,t})
→ 200 { code, token }
```

**Create (fresh custom code):**
```
GET /shorten-v2?url=...&shortCode=foo
→ server: KV.get(foo) = null → token = random()
→ KV.put(foo, JSON{q,t})
→ 200 { code: "foo", token }
```

**Overwrite (correct token):**
```
GET /shorten-v2?url=...&shortCode=foo
X-Shortlink-Token: abc
→ server: KV.get(foo) = JSON{q0,t0}, abc === t0
→ KV.put(foo, JSON{q1, t0})  // token unchanged
→ 200 { code: "foo", token: t0 }
```

**Overwrite (missing/wrong token):**
```
GET /shorten-v2?url=...&shortCode=foo   # no or bad X-Shortlink-Token
→ 403 { error: "token required" | "token mismatch" }
```

**Claim legacy link:**
```
GET /shorten-v2?url=...&shortCode=foo
→ server: KV.get(foo) = "?old=stuff" (legacy, starts with '?')
→ token = random()
→ KV.put(foo, JSON{q_new, t_new})   // upgrade in place
→ 200 { code: "foo", token: t_new }
```

## Risks and Trade-offs

- **Breaking API change.** `/shorten-v2` response type changes from `text/plain` to `application/json`. External callers must be updated. Called out in CHANGELOG and README. Version bump recommended (minor, since this is a security-relevant behavior change but not a semver-major contract overhaul in this project).
- **Legacy-claim race.** The first caller to hit an old shortCode claims it. Acceptable trade-off for smooth migration; the alternative (locking all legacy links out of updates) was explicitly rejected.
- **Plaintext tokens in KV.** Explicitly chosen. If KV storage is compromised, attacker can overwrite any link. The worst-case blast radius is "short-link targets get redirected somewhere else" — not a data breach. If this threat model changes, hashing is a straightforward follow-up.
- **Token loss.** If the user loses the token and doesn't have localStorage caching (we didn't add it), they cannot modify their link. They can still create a new one with a different code. Accepted as user responsibility.
- **No rate limiting on token guesses.** 32-char base64url token (144 bits) has a brute-force search space that makes this a non-issue in practice, but there's no explicit lockout. Acceptable.

## Out-of-Scope Follow-ups

- Frontend localStorage caching of `shortCode → token` (rejected for simplicity; reconsider if user feedback demands it).
- Token rotation endpoint.
- Server-side token hashing.
- Admin endpoint to forcibly reclaim a short code.
