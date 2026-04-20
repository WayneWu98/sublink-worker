# Custom Rule: Domain Full-Match Field

**Date:** 2026-04-20
**Status:** Approved, ready for implementation planning

## Problem

The Custom Rules form (`src/components/CustomRules.jsx`) exposes `domain_suffix`, `domain_keyword`, `src_ip_cidr`, `ip_cidr`, `protocol`, `site` (geo-site), and `ip` (geo-ip) — but there is no way to express an **exact domain match** (e.g., `DOMAIN,example.com,Proxy` in Clash/Surge, or sing-box's `domain: [...]`).

`domain_suffix=example.com` matches both the apex and all subdomains, which covers most use cases but cannot express apex-only matching. Users who need exact-match semantics currently have no path through the UI, and even hand-writing a `domain` field in JSON mode is silently dropped by `generateRules()` — it never reaches any builder.

## Goal

Add a `domain_full` field to the custom-rule schema that produces exact-match rules across all three output formats (sing-box, Clash, Surge).

## Naming decision

UI / schema / intermediate representation: **`domain`**.

Rationale: a user editing JSON directly should be able to recognize the field. `domain` matches sing-box's output key verbatim and maps cleanly to Clash/Surge's `DOMAIN,` rule prefix. The UI label makes the semantics explicit ("Domain — exact match"), so the visual ambiguity between `domain` and `domain_suffix` is resolved at the label level rather than the field-name level. Internal name `domain` carries from form through generator to all three builders with no renaming.

## Scope

### Changed files

| # | File | Change |
|---|---|---|
| 1 | `src/components/CustomRules.jsx` | Add `domain` input (labeled "Domain — exact match") before `domain_suffix`. Add `domain: ''` to `addRule()` default object. Update JSON-mode placeholder example to include the new field. |
| 2 | `src/i18n/index.js` | Add 3 keys for both `zh-CN` and `en`: `customRuleDomain`, `customRuleDomainPlaceholder`, `customRuleDomainTooltip` (tooltip explains "exact match only — does not include subdomains"). |
| 3 | `src/config/ruleGenerators.js` | In `generateRules()`, pass `domain: toStringArray(rule.domain)` through the `customRules.forEach` block. |
| 4a | `src/builders/SingboxConfigBuilder.js` | In the domain branch (around line 486), expand the filter predicate to include `hasMatchValues(rule.domain)` and emit `entry.domain = rule.domain` when present. |
| 4b | `src/builders/helpers/clashConfigUtils.js` | Add a new branch mirroring the `domain_suffix` loop, emitting `DOMAIN,<x>,<outbound>` for each value of `rule.domain`. |
| 4c | `src/builders/SurgeConfigBuilder.js` | Add a new branch mirroring the `domain_suffix` loop (around line 446), emitting `DOMAIN,<x>,<outbound>`. |

### Data flow

```
UI form rule.domain (string, comma-separated)
  ↓  JSON.stringify → <input name="customRules">
generateRules()  →  { domain: ["a.com","b.com"], outbound: "MyRule", … }
  ↓
├─ Singbox builder → route.rules[*].domain = ["a.com","b.com"]
├─ Clash   builder → "DOMAIN,a.com,🎯MyRule" × N
└─ Surge   builder → "DOMAIN,a.com,MyRule" × N
```

`domain` stays as the field name from UI through generator to builders, and matches sing-box's output key directly. Clash/Surge builders read `rule.domain` and emit the `DOMAIN,` rule-type prefix.

### Interaction with existing fields

- `domain`, `domain_suffix`, `domain_keyword` can coexist on the same rule. In sing-box, all three merge into one route-rule entry (sing-box matches if *any* of the domain predicates hits). In Clash/Surge, each value produces its own rule line — the existing pattern.
- No impact on `site`/`ip` rule-set fields, `src_ip_cidr`, `ip_cidr`, `protocol`. These continue to work as before.

## Testing

New test file: `test/custom-rule-domain-full.test.js`.

**Coverage:**
1. Given `{ name:"MyRule", domain:"a.com,b.com", outbound:"MyRule" }`:
   - sing-box config has a route rule with `domain: ["a.com","b.com"]` and `outbound: "MyRule"` (via `t('outboundNames.MyRule')`)
   - Clash config contains `DOMAIN,a.com,...` and `DOMAIN,b.com,...` rule lines
   - Surge config contains `DOMAIN,a.com,MyRule` and `DOMAIN,b.com,MyRule` rule lines
2. Given a rule with `domain`, `domain_suffix`, and `domain_keyword` all populated, all three types appear correctly in each builder's output.
3. Given `domain: ''` (empty), no `DOMAIN,` / `domain:` output is generated (regression guard: the empty-string branch must not emit `DOMAIN,,outbound`).

## Non-goals (YAGNI)

- No changes to JSON-mode validation. The existing `Array.isArray` check still covers the new optional field.
- No changes to short-link encode/decode. `customRules` is serialized as a whole JSON blob; the new field rides along automatically.
- No changes to built-in rule sets (`UNIFIED_RULES`). Exact-match semantics are a per-user custom-rule concern.
- No migration for existing saved custom rules. The new field is optional and defaults to empty — old rules continue to work unchanged.
