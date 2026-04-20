# Surge `#!MANAGED-CONFIG` — Preserve Short URL

**Status:** Draft
**Date:** 2026-04-20

## Problem

Surge returns a config whose first line is:

```
#!MANAGED-CONFIG <url> interval=43200 strict=false
```

That directive tells the Surge client to **replace the stored subscription URL** with `<url>` on the next refresh. Today the URL is sourced from `c.req.url` at [src/app/createApp.jsx:207](../../../src/app/createApp.jsx#L207), which is always the full long converter URL (e.g. `https://host/surge?config=...&selectedRules=...`).

When a user originally subscribed via a short link like `https://host/s/abc123`, the `/s/:code` handler at [src/app/createApp.jsx:330-342](../../../src/app/createApp.jsx#L330-L342) 302-redirects to the long URL. The Surge handler sees only the long URL and bakes it into `MANAGED-CONFIG`. The client then pins itself to the long URL and **stops using the short link**. If the user later overwrites the short code's mapping (via `/shorten-v2` with the token), the client keeps fetching the old long URL and never sees the new config.

## Goal

When the Surge config is produced via a short-code redirect, write the **short URL** into `#!MANAGED-CONFIG` so the client remains pinned to the short link. Direct-access requests (no short link involved) keep the current behavior.

## Non-Goals

- Any change to Clash / Singbox / Xray response bodies. Those formats have no standard URL-override mechanism in mainstream clients (`# Subscription: ...` comments in Clash YAML are ignored by ClashX, Mihomo, Clash Verge, Clash for Windows), so embedding a URL there would be cosmetic only and out of scope.
- Any change to `/b/:code`, `/c/:code`, `/x/:code` redirect handlers — only `/s/:code` is affected.
- Any change to the short-link creation / auth flow (`/shorten-v2`, `/resolve`, tokens).

## Decisions Already Made During Brainstorming

1. **Scope: Surge only.** Surge is the only supported format with a standard subscription-URL override (`#!MANAGED-CONFIG`). Other formats' clients manage subscription URLs independently of response body.
2. **Mechanism: query-parameter passthrough via the existing 302 redirect.** `/s/:code` appends `&sub_url=<encoded short url>` to its redirect target. The `/surge` handler reads `sub_url` and uses it as the subscription URL. Rejected alternatives: in-process forwarding inside `/s/:code` (larger refactor, no user-visible benefit); `Referer` header (unreliable — Surge-class clients do not consistently send it when following 302s).
3. **Parameter name: `sub_url`.** Short, acceptable collision risk. Prefixed variants (`_managed_url`, `__sublink_managed_url`) rejected as unnecessary.
4. **Same-origin validation is mandatory.** Without it, anyone can craft `https://host/surge?config=...&sub_url=https://evil.com/surge` and trick a client into replacing its subscription URL with an attacker-controlled one. With same-origin enforcement, `sub_url` can only point back to our own host, which is equivalent to what the user already reaches.
5. **Fallback on invalid `sub_url`:** ignore it, use `c.req.url` with the `sub_url` parameter stripped (so a rejected value does not leak into the `MANAGED-CONFIG` line).
6. **`sub_url` is honored on direct access too, if same-origin.** Allows script / automation users to explicitly pin a different same-host URL. No extra risk beyond the short-link path.

## Architecture

### Change 1 — Short-code redirect handler

**File:** [src/app/createApp.jsx](../../../src/app/createApp.jsx)
**Location:** the `redirectHandler` factory around lines 330-342, specifically the `/s/:code` route at line 344.

Today all four redirect routes (`/s`, `/b`, `/c`, `/x`) share one `redirectHandler(prefix)` factory. The factory builds `${url.origin}/${prefix}${originalParam}` and 302-redirects.

Only the `/s/:code` path needs to append `sub_url`. Two viable shapes:

- **Option A — branch inside the shared factory** on `prefix === 'surge'`. Minimal diff.
- **Option B — a dedicated `surgeRedirectHandler`** separate from the shared factory for the other three prefixes. Slightly more code, clearer intent.

Chosen: **Option A**. The condition is one line, the branching reads naturally, and it keeps a single place where short-code resolution happens.

Logic:

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

Note on `originalParam`: the service stores it as a query string starting with `?`, so the separator check above is defensive — in practice it's always `?`. Kept anyway to avoid relying on storage-format assumptions.

### Change 2 — Surge handler subscription-URL resolution

**File:** [src/app/createApp.jsx](../../../src/app/createApp.jsx)
**Location:** `/surge` route, line 207 (`builder.setSubscriptionUrl(c.req.url);`).

Replace the unconditional assignment with a helper that picks the right URL:

```js
builder.setSubscriptionUrl(resolveSurgeSubscriptionUrl(c.req));
```

Where `resolveSurgeSubscriptionUrl` (new pure function, defined near the bottom of `createApp.jsx` alongside other helpers) is:

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

    // Invalid / missing / cross-origin sub_url: strip it and return the request URL.
    reqUrl.searchParams.delete('sub_url');
    return reqUrl.toString();
}
```

Two behaviors in one function:

- Valid same-origin `sub_url` → use it verbatim.
- Anything else → fall back to `c.req.url`, but with `sub_url` removed so a rejected value never appears in `MANAGED-CONFIG`.

### Change 3 — None to `SurgeConfigBuilder`

[src/builders/SurgeConfigBuilder.js](../../../src/builders/SurgeConfigBuilder.js) already exposes `setSubscriptionUrl(url)` and emits the `#!MANAGED-CONFIG` line in `formatConfig()` (lines 18-21, 383-385). No change needed.

## Data Flow

```
Client subscribes to https://host/s/abc123
  ↓ GET /s/abc123
  ↓ redirectHandler('surge')
  ↓   resolve abc123 → originalParam = "?config=...&selectedRules=..."
  ↓   target = https://host/surge?config=...&selectedRules=...&sub_url=https%3A%2F%2Fhost%2Fs%2Fabc123
  ↓ 302
Client follows → GET https://host/surge?...&sub_url=...
  ↓ /surge handler
  ↓   resolveSurgeSubscriptionUrl → "https://host/s/abc123" (same-origin ✓)
  ↓   builder.setSubscriptionUrl("https://host/s/abc123")
  ↓   builder.build() → formatConfig()
Response body first line:
  #!MANAGED-CONFIG https://host/s/abc123 interval=43200 strict=false
  ↓
Surge client pins stored subscription URL to the short link.
Next refresh → GET /s/abc123 → follows current mapping → picks up any updates
the user pushed via /shorten-v2 overwrite.
```

## Security

The `sub_url` parameter is the only new attack surface.

**Threat:** An attacker crafts `https://host/surge?config=<benign>&sub_url=https://evil.com/surge` and convinces a victim to subscribe. The returned config would contain `#!MANAGED-CONFIG https://evil.com/surge`, so Surge would replace the stored subscription URL with the attacker's endpoint. Subsequent refreshes would fetch from evil.com, exposing the client's IP and allowing the attacker to serve arbitrary proxy configurations.

**Mitigation:** Same-origin check. `sub_url` is honored only when `new URL(sub_url).origin === new URL(req.url).origin`. Any mismatch → silently dropped. The victim still gets a working config (MANAGED-CONFIG falls back to the long URL on the legitimate host), so the attack is neutralized without a visible error that would reveal the probe.

**Residual risk:** None beyond status quo. A value that passes same-origin simply resolves to another URL on our own host, which the user already reaches. The `/s/:code` redirect endpoint itself has no authentication (by design — legacy short links must stay anonymously resolvable per [2026-04-17-short-code-loader-design.md](./2026-04-17-short-code-loader-design.md)), so a same-origin `sub_url` is strictly equivalent to the user browsing to `/s/:code` directly.

**Not a mitigation:** Restricting `sub_url` to paths starting with `/s/`. Adds complexity without reducing attack surface under the same-origin rule.

## Testing

Unit-level coverage for `resolveSurgeSubscriptionUrl` and integration-level coverage for the redirect + Surge response.

| Case | Input | Expected MANAGED-CONFIG URL |
|---|---|---|
| Short-code access | GET `/s/abc123` → follows 302 | `https://host/s/abc123` |
| Direct access, no `sub_url` | GET `/surge?config=...` | `https://host/surge?config=...` (unchanged) |
| Direct access, same-origin `sub_url` | GET `/surge?config=...&sub_url=https://host/s/foo` | `https://host/s/foo` |
| Direct access, cross-origin `sub_url` | GET `/surge?config=...&sub_url=https://evil.com/surge` | `https://host/surge?config=...` (sub_url stripped, no evil.com) |
| Malformed `sub_url` | GET `/surge?config=...&sub_url=not-a-url` | `https://host/surge?config=...` (sub_url stripped) |
| Protocol mismatch (http vs https same host) | GET `https://host/surge?...&sub_url=http://host/s/foo` | fallback, stripped — `URL.origin` differentiates scheme |

Existing `test/` suite covers Surge and short-link flows; extend there.

## Rollout & Compatibility

- **Backward compatible.** Clients already subscribed to the long URL keep working exactly as before on direct access (no `sub_url` in their stored URL, fallback branch runs).
- **First-refresh migration for existing short-link subscribers.** Clients currently pinned to the long URL (because an older build wrote it into MANAGED-CONFIG) will not auto-migrate to the short URL; they need one manual reset (re-enter the short URL in Surge) to pick up the new behavior. Document in release notes.
- **No new KV writes, no DB migration.**

## Open Questions

None outstanding.
