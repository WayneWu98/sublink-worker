# Rule Groups Expansion Design

Date: 2026-04-23

## Goal

Reduce "rule leakage" — traffic that falls through to the default `Non-China` bucket because no built-in rule group covers it. Give users:

1. More built-in rule groups to choose from (collapsed by default, non-intrusive).
2. The ability to subscribe to any public rule-set file (not only MetaCubeX) as an independent proxy group.
3. Full round-trip preservation of these additions through the existing share-link / short-link mechanism.

## Non-Goals

- No breaking changes. `minimal` / `balanced` / `comprehensive` presets retain their current member lists.
- No compression of long share URLs (separate optimization).
- No in-browser rule-hit tester, priority drag-and-drop UI, or admin-side provider management.
- No migration of stored short-link payloads.

## Current State (Baseline)

- `UNIFIED_RULES` in `src/config/rules.js` defines 18 groups, each mapping a group name to upstream geosite/geoip filename stems.
- Rule-set URLs are built in `src/config/ruleGenerators.js` by string-concatenating `BASE + filename + ext` where the base URL is one of the format-specific constants in `src/config/ruleUrls.js` (sing-box/clash/surge).
- `CustomRule` (in `src/components/CustomRules.jsx` and the `generateRules` path) supports a `site` / `ip` field, which accepts a filename stem. This currently hard-codes the MetaCubeX base URL — users can reference any MetaCubeX file, but cannot use another source or a full URL.
- Share link round-trip: `formLogic.js` serializes `selectedRules` (array or preset name) and `customRules` (JSON) into query string; the same keys are parsed on restore.

## Design

### 1. Data Model

#### 1.1 Extended built-in groups

Append 15 new entries to `UNIFIED_RULES`, each with an `extended: true` marker:

| Name | site_rules | ip_rules |
|---|---|---|
| Discord | `discord` | — |
| WhatsApp | `whatsapp` | — |
| Signal | `signal` | — |
| Line | `line` | — |
| Zoom | `zoom` | — |
| Spotify | `spotify` | — |
| News | `category-news-!cn` | — |
| Reddit | `reddit` | — |
| Twitch | `twitch` | — |
| Pixiv | `pixiv` | — |
| Developer | `category-dev-!cn` | — |
| OpenAI | `openai` | — |
| Anthropic | `anthropic` | — |
| Speedtest | `speedtest` | — |
| Porn | `category-porn` | — |

Rationale for `extended` marker:
- UI filters on it to place these in a collapsed "more" area.
- Required change in `rules.js`: today `PREDEFINED_RULE_SETS.comprehensive = UNIFIED_RULES.map(r => r.name)` (line 107) — after this change it becomes `UNIFIED_RULES.filter(r => !r.extended).map(r => r.name)`, preserving the current 18-group composition.

#### 1.2 New concept: `customRuleSets`

Independent of `customRules`. A `customRuleSets` entry subscribes to an external rule-set file and registers a proxy group.

```js
{
  name: 'MyReddit',          // group name (also rule-set tag / outbound)
  provider: 'metacubex',     // 'metacubex' | 'blackmatrix7' | 'loyalsoldier' | 'acl4ssr' | 'custom'
  file: 'reddit',            // filename stem; used when provider !== 'custom'
  urls: {                    // full URLs; used when provider === 'custom'
    singbox: '',
    clash: '',
    surge: ''
  },
  type: 'site',              // 'site' | 'ip'
  outbound: 'Proxy'          // 'Proxy' | 'Direct' | 'Reject' | any selector name
}
```

#### 1.3 Provider dictionary

New file `src/config/ruleSetProviders.js`:

```js
export const RULE_SET_PROVIDERS = {
  metacubex: {
    label: 'MetaCubeX',
    formats: {
      singbox: { site: { base: '...sing/geo/geosite/', ext: '.srs', filePattern: '{file}' },
                 ip:   { base: '...sing/geo/geoip/',   ext: '.srs', filePattern: '{file}' } },
      clash:   { site: { base: '...meta/geo/geosite/', ext: '.mrs', filePattern: '{file}' }, ... },
      surge:   { ... }
    }
  },
  blackmatrix7: {
    label: 'blackmatrix7',
    formats: {
      singbox: { site: { base: '...ios_rule_script/release/rule/sing-box/',
                         ext: '.srs',
                         filePattern: '{file}/{file}' }, ... },
      // clash + surge analogous
    }
  },
  loyalsoldier: { /* v2ray-rules-dat + equivalents */ },
  acl4ssr:      { formats: { clash: {...}, surge: {...} } },  // no singbox key -> format-gated
  // 'custom' is not listed here; resolver treats provider === 'custom' specially
};
```

`filePattern` supports `{file}` substitution so providers with per-service subdirectories (e.g. blackmatrix7) resolve correctly.

### 2. Generation Logic

#### 2.1 New resolver

```js
// src/config/ruleGenerators.js
function resolveCustomRuleSetUrl(item, format) {
  if (item.provider === 'custom') {
    return item.urls?.[format] || null;   // null = skip + warn
  }
  const provider = RULE_SET_PROVIDERS[item.provider];
  const spec = provider?.formats?.[format]?.[item.type];
  if (!spec) return null;                  // format-gated (e.g. acl4ssr + singbox)
  const stem = spec.filePattern.replace('{file}', item.file);
  return `${spec.base}${stem}${spec.ext}`;
}
```

#### 2.2 Integration with existing generators

- `generateRules(selectedRules, customRules, customRuleSets)`: after the current `UNIFIED_RULES` loop, push one rule per `customRuleSets` entry. The rule's `site_rules` or `ip_rules` contains the group name; `outbound` is `item.outbound`; the actual rule-set is registered below.
- `generateRuleSets(selectedRules, customRules, customRuleSets)` and `generateClashRuleSets(...)`: after custom-rules processing, append one rule-set entry per `customRuleSets` item, calling `resolveCustomRuleSetUrl`. Skip (with console warning) if URL is `null`.
- Surge config builder: analogous section in its own rule-generation path.

#### 2.3 Warning behavior for missing URLs

When `resolveCustomRuleSetUrl` returns `null`:
- Skip that rule-set entry for this format.
- Emit a warning as a comment line at the top of the output config (sing-box JSON lacks comments — emit as `X-Warning` response header instead for sing-box; embed as `#` / `//` comment for clash/surge).
- Never fail the build.

### 3. UI

#### 3.1 Extended rule groups (collapsed pane)

In the rule-group card (currently rendering all 18 checkboxes in `Form.jsx`):
- Render non-`extended` rules (the existing 18) as-is.
- Render a "Show more rule groups (15)" disclosure button below.
- On click, expand to reveal `extended` group checkboxes.
- Checked extended groups append their names to `selectedRules` — identical wire format to existing groups, so no downstream code changes.
- Switching preset to `comprehensive` does **not** auto-check extended groups.

#### 3.2 Custom RuleSet card

New component `src/components/CustomRuleSets.jsx`, rendered directly below the existing `CustomRules` card in `Form.jsx`. Structure mirrors `CustomRules.jsx`:

- Form / JSON mode toggle.
- Add / delete / clear-all actions.
- Per-item fields:
  - `name` — text
  - `provider` — select (metacubex/blackmatrix7/loyalsoldier/acl4ssr/custom)
  - `type` — select (site/ip)
  - `file` — text; visible when `provider !== 'custom'`
  - `urls.singbox` / `urls.clash` / `urls.surge` — text × 3; visible when `provider === 'custom'`
  - `outbound` — select, options = `selectedRules` ∪ {Proxy, Direct, Reject, Node Select}
- Hidden `<input name="customRuleSets">` carrying `JSON.stringify(rules)` for form submission, analogous to the existing `customRules` pattern.
- Listens for a `restore-custom-rulesets` window event to repopulate state.

#### 3.3 Form-level validation

- `custom` provider: require at least one URL in `urls`.
- Non-`custom` provider: require non-empty `file`.
- Warn (non-blocking) when the chosen provider lacks the selected format (e.g. acl4ssr + sing-box).

#### 3.4 i18n

Add keys to `src/i18n/index.js` for all 4 languages (zh-CN, en, fa, ru):
- Display name for each of the 15 new groups.
- `extendedRuleGroups`, `showMoreRuleGroups`, `hideMoreRuleGroups`.
- `customRuleSetsSection`, `customRuleSetsSectionTooltip`.
- Field labels: `ruleSetProvider`, `ruleSetFile`, `ruleSetUrlSingbox`, `ruleSetUrlClash`, `ruleSetUrlSurge`, `ruleSetType`, `ruleSetOutbound`.
- Validation messages: `ruleSetFileRequired`, `ruleSetUrlRequired`, `ruleSetProviderFormatUnsupported`.

### 4. Share-Link Round-Trip

#### 4.1 Wire format

New query parameter `customRuleSets` = `JSON.stringify(array)`. Example:

```
&customRuleSets=[{"name":"MyReddit","provider":"metacubex","file":"reddit","type":"site","outbound":"Proxy"}]
```

#### 4.2 Code changes

- `src/components/formLogic.js`:
  - Serialize: append `customRuleSets` when the hidden input carries a non-empty array, mirroring existing `customRules` handling.
  - Restore: read `params.get('customRuleSets')`; on success, dispatch a `restore-custom-rulesets` `CustomEvent` with `{detail: {rules: parsed}}`.
- `src/components/CustomRuleSets.jsx`: register a `window.addEventListener('restore-custom-rulesets', ...)` inside the alpine `init()`.
- `src/app/createApp.jsx`: in each of the four builder entry handlers (sing-box, clash, surge, and one more), parse `customRuleSets` from query, default to `[]`, and pass through to the builder constructor.
- Each builder constructor (`SingboxConfigBuilder`, `ClashConfigBuilder`, `SurgeConfigBuilder`): accept `customRuleSets` param, store as `this.customRuleSets`, and pass it into `generateRules` / `generateRuleSets`.

#### 4.3 Backward compatibility

- Missing `customRuleSets` param → parsed as `[]` → identical output to current main.
- `selectedRules` semantics (preset name or JSON array) unchanged.
- Short-link storage (`shortLinkService` / `configStorageService`) stores the full query string verbatim; it requires no schema change.

### 5. File Change Map

| Action | Path | Summary |
|---|---|---|
| Create | `src/config/ruleSetProviders.js` | `RULE_SET_PROVIDERS` dict |
| Modify | `src/config/rules.js` | Append 15 extended groups; keep `PREDEFINED_RULE_SETS.comprehensive` literal (do not derive from full array) |
| Modify | `src/config/ruleGenerators.js` | `resolveCustomRuleSetUrl`; extend `generateRules`, `generateRuleSets`, `generateClashRuleSets` |
| Create | `src/components/CustomRuleSets.jsx` | New form card |
| Modify | `src/components/Form.jsx` | Mount `<CustomRuleSets />`; add extended-groups disclosure |
| Modify | `src/components/formLogic.js` | Extended-group UI filtering; `customRuleSets` URL serialize/restore |
| Modify | `src/app/createApp.jsx` | Parse `customRuleSets` in 4 handlers, pass to builders |
| Modify | `src/builders/SingboxConfigBuilder.js` | Constructor + `generate*` call sites |
| Modify | `src/builders/ClashConfigBuilder.js` | Constructor + `generate*` call sites |
| Modify | `src/builders/SurgeConfigBuilder.js` | Constructor + generation path |
| Modify | `src/i18n/index.js` | Display names + UI copy × 4 languages |
| Modify | `README.md` + `README.zh-Hans.md` | Short "extended rule groups & custom rule-sets" section |

### 6. Testing

Existing test layout to be confirmed during plan phase. Expected coverage:

**Unit**
- `resolveCustomRuleSetUrl`:
  - Each provider × (site, ip) × (singbox, clash, surge) — basic resolution.
  - `blackmatrix7` uses `{file}/{file}` path pattern correctly.
  - `acl4ssr` + `singbox` returns `null` (format gate).
  - `custom` + missing URL for format returns `null`.
- `generateRuleSets` / `generateClashRuleSets` / Surge equivalent:
  - Given `customRuleSets`, output contains expected provider/rule entries with correct URL.
  - Empty `customRuleSets` → output identical to current behavior (regression guard).
- URL round-trip:
  - Serialize `selectedRules` containing extended-group names + `customRuleSets` → parse → deep-equal original.

**Integration**
- Request flow: construct a request with 3 existing groups + 2 extended groups + 2 `customRuleSets` (one metacubex, one custom with all three URLs). For each of sing-box / clash / surge outputs, assert relevant rule-set entries exist and URLs match expected format. Use field-level assertions, not snapshot diffs.
- Backward compatibility: request with only legacy params (no `customRuleSets`) produces output byte-equal to a pre-change baseline for at least one representative configuration per format.

### 7. Rollout & Rollback

- Additive change; no data migration.
- Revert = single PR revert; no stored state dependency.
- Docker image tag bump handled in the normal release cycle — not part of this work item.

### 8. Explicit Non-Scope

- Share URL compression.
- Dynamic provider configuration (admin UI, JSON config).
- Rule-hit debug / visualization tooling.
- Treating ACL4SSR bundles as a new preset.
- Priority reorder UI (current order: `customRules` unshifted before extended/built-in, preserved as today).
