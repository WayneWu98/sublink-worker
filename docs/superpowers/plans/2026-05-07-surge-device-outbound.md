# Surge `DEVICE:device_name` Outbound Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `DEVICE:device_name` as an outbound target in custom rules and custom rule sets. Surge emits the policy verbatim (no wrapper group); Clash and Sing-box silently skip those rules.

**Architecture:** Single shared helper `isDeviceOutbound(value)` (prefix detect on `DEVICE:`). Surge builder treats it as a policy passthrough; Clash and Sing-box builders filter `customRules` / `customRuleSets` containing DEVICE before they enter `generateRules` / `generateRuleSets` / `emitClashRules`. UI adds a new "Surge Devices" section that declares device names; declared names populate optgroups in the Custom Rules and Custom Rule Sets outbound dropdowns. URL persistence mirrors the existing `customRuleSets` flow so shared subconverter links round-trip cleanly.

**Tech Stack:** Vitest, hono/jsx (server-rendered components), Alpine.js (client-side reactivity).

**Spec:** `docs/superpowers/specs/2026-05-07-surge-device-outbound-design.md`

---

## File Structure

**New files:**
- `src/components/SurgeDevices.jsx` — declares Surge device names; mirrors `CustomRuleSets.jsx` shape
- `test/surge-device-outbound.test.js` — builder behavior across Surge / Clash / Sing-box
- `test/surge-device-formlogic.test.js` — URL encode/decode round-trip

**Modified files:**
- `src/builders/BaseConfigBuilder.js` — export `isDeviceOutbound`
- `src/builders/SurgeConfigBuilder.js` — passthrough in `addCustomRuleGroups`, `addCustomRuleSetGroups`, `resolveCustomRuleSetDefault`, and the rule-emit loops in `formatConfig`
- `src/builders/ClashConfigBuilder.js` — filter DEVICE entries in `formatConfig` and skip in `addCustomRule*Groups`
- `src/builders/SingboxConfigBuilder.js` — filter DEVICE entries in `formatConfig` and skip in `addCustomRule*Groups`
- `src/i18n/index.js` — add `outboundSurgeDevices` to all four locales
- `src/components/Form.jsx` — render `<SurgeDevices>` above `<CustomRuleSets>`
- `src/components/CustomRules.jsx` — Surge Devices optgroup, validator, listener
- `src/components/CustomRuleSets.jsx` — same dropdown additions
- `src/components/formLogic.js` — URL encode (`getSubconverterUrl`) and decode (`populateFormFromUrl`)

---

## Task 1: Add `isDeviceOutbound` helper to BaseConfigBuilder

**Files:**
- Modify: `src/builders/BaseConfigBuilder.js`
- Test: `test/surge-device-outbound.test.js` (create)

- [ ] **Step 1: Write failing tests for the helper**

Create `test/surge-device-outbound.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { isDeviceOutbound } from '../src/builders/BaseConfigBuilder.js';

describe('isDeviceOutbound', () => {
    it('returns true for "DEVICE:tower"', () => {
        expect(isDeviceOutbound('DEVICE:tower')).toBe(true);
    });

    it('returns true for "DEVICE:my-iphone"', () => {
        expect(isDeviceOutbound('DEVICE:my-iphone')).toBe(true);
    });

    it('returns false for "Node Select"', () => {
        expect(isDeviceOutbound('Node Select')).toBe(false);
    });

    it('returns false for "DIRECT"', () => {
        expect(isDeviceOutbound('DIRECT')).toBe(false);
    });

    it('returns false for the empty string', () => {
        expect(isDeviceOutbound('')).toBe(false);
    });

    it('returns false for null/undefined/non-string input', () => {
        expect(isDeviceOutbound(null)).toBe(false);
        expect(isDeviceOutbound(undefined)).toBe(false);
        expect(isDeviceOutbound(42)).toBe(false);
        expect(isDeviceOutbound({})).toBe(false);
    });

    it('is case-sensitive (does not match "device:tower")', () => {
        expect(isDeviceOutbound('device:tower')).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/surge-device-outbound.test.js`
Expected: FAIL with import error — `isDeviceOutbound is not defined`.

- [ ] **Step 3: Add the helper**

In `src/builders/BaseConfigBuilder.js`, after the `RESERVED_OUTBOUNDS` Set definition (~line 17), insert:

```javascript
/**
 * True iff `value` is a Surge "DEVICE:device_name" policy literal.
 * Used by all three builders to detect Surge-only outbound targets.
 */
export function isDeviceOutbound(value) {
    return typeof value === 'string' && value.startsWith('DEVICE:');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/surge-device-outbound.test.js`
Expected: PASS, all 7 cases.

- [ ] **Step 5: Commit**

```bash
git add src/builders/BaseConfigBuilder.js test/surge-device-outbound.test.js
git commit -m "feat(builders): add isDeviceOutbound helper for Surge DEVICE policy"
```

---

## Task 2: Surge — passthrough DEVICE policy in rule emission

`SurgeConfigBuilder.formatConfig` currently wraps every non-DIRECT/non-REJECT rule outbound in `t('outboundNames.' + rule.outbound)`. For `DEVICE:tower` we want the literal value to flow through unchanged.

**Files:**
- Modify: `src/builders/SurgeConfigBuilder.js:430-552` (formatConfig method)
- Test: `test/surge-device-outbound.test.js`

- [ ] **Step 1: Add failing test (rule passthrough)**

Append to `test/surge-device-outbound.test.js`:

```javascript
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

const SAMPLE = 'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#Node1';

describe('SurgeConfigBuilder — DEVICE outbound on custom rules', () => {
    it('emits DOMAIN-SUFFIX,...,DEVICE:my-iphone verbatim', async () => {
        const customRules = [
            { name: 'DEVICE:my-iphone', domain_suffix: 'work.example.com' }
        ];
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], customRules, null, 'en', '', false, true, []
        );
        const text = await builder.build();
        expect(text).toContain('DOMAIN-SUFFIX,work.example.com,DEVICE:my-iphone');
    });

    it('does not create a "DEVICE:my-iphone" proxy group', async () => {
        const customRules = [
            { name: 'DEVICE:my-iphone', domain_suffix: 'work.example.com' }
        ];
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], customRules, null, 'en', '', false, true, []
        );
        const text = await builder.build();
        const proxyGroupSection = text.split('[Proxy Group]')[1].split('[Rule]')[0];
        expect(proxyGroupSection).not.toContain('DEVICE:my-iphone =');
    });

    it('does not call t() on DEVICE outbound (no translation prefix leakage)', async () => {
        const customRules = [
            { name: 'DEVICE:tower', domain: 'foo.com' }
        ];
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], customRules, null, 'en', '', false, true, []
        );
        const text = await builder.build();
        // The outbound must be DEVICE:tower exactly — not "outboundNames.DEVICE:tower"
        expect(text).toContain('DOMAIN,foo.com,DEVICE:tower');
        expect(text).not.toContain('outboundNames.DEVICE');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/surge-device-outbound.test.js`
Expected: FAIL — currently the rule emitter calls `t('outboundNames.DEVICE:my-iphone')` which returns the key itself unchanged (a leaky fallback), and `addCustomRuleGroups` creates a `DEVICE:my-iphone = select, ...` group.

- [ ] **Step 3: Update `addCustomRuleGroups` to skip DEVICE entries**

In `src/builders/SurgeConfigBuilder.js`, at the top of the inner `forEach` in `addCustomRuleGroups` (currently line 325), add an early return after the existing reserved-outbound guard:

```javascript
addCustomRuleGroups(proxyList) {
    if (Array.isArray(this.customRules)) {
        this.customRules.forEach(rule => {
            // Skip built-in outbound names to avoid shadowing them with a same-named group.
            if (RESERVED_OUTBOUNDS.has(String(rule.name || '').toUpperCase())) return;
            if (isDeviceOutbound(rule.name)) return;  // Surge DEVICE:xxx is a policy, not a group
            if (this.hasProxyGroup(rule.name)) return;
            // ... rest unchanged ...
```

Add to the import at line 1:

```javascript
import { BaseConfigBuilder, RESERVED_OUTBOUNDS, isDeviceOutbound } from './BaseConfigBuilder.js';
```

- [ ] **Step 4: Update rule-emit loops in `formatConfig` to passthrough DEVICE**

In `src/builders/SurgeConfigBuilder.js`, inside `formatConfig` (~line 430), after the existing `const rules = generateRules(...)` line, add a small helper:

```javascript
const policyFor = (rule) => isDeviceOutbound(rule.outbound)
    ? rule.outbound
    : this.t('outboundNames.' + rule.outbound);
```

Then replace every `this.t('outboundNames.' + rule.outbound)` call inside the rule-emit blocks (the SRC-IP, DOMAIN, DOMAIN-SUFFIX, DOMAIN-KEYWORD, RULE-SET site/ip, IP-CIDR sections — currently lines 487, 489, 499, 505, 511, 532, 538, 545) with `policyFor(rule)`. Example for the DOMAIN-SUFFIX block:

```javascript
rules.filter(rule => !!rule.domain_suffix).map(rule => {
    rule.domain_suffix.forEach(suffix => {
        finalConfig.push(`DOMAIN-SUFFIX,${suffix},${policyFor(rule)}`);
    });
});
```

Apply the same substitution to all six rule-emit blocks. Leave the `customRuleSets` block (line 517-528) as-is for now — Task 3 handles it separately.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/surge-device-outbound.test.js`
Expected: All Task 1 + Task 2 cases PASS.

- [ ] **Step 6: Run full test suite to catch regressions**

Run: `npx vitest run`
Expected: All previously-passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/builders/SurgeConfigBuilder.js test/surge-device-outbound.test.js
git commit -m "feat(surge): passthrough DEVICE:xxx policy in custom-rule emission"
```

---

## Task 3: Surge — passthrough DEVICE policy on custom rule sets

When a custom rule set's `outbound` is `DEVICE:xxx`, the RULE-SET line should target the device directly rather than a wrapper proxy group.

**Files:**
- Modify: `src/builders/SurgeConfigBuilder.js:342-362` (`addCustomRuleSetGroups`, `resolveCustomRuleSetDefault`) and `:517-528` (the customRuleSets emit loop)
- Test: `test/surge-device-outbound.test.js`

- [ ] **Step 1: Add failing test**

Append to `test/surge-device-outbound.test.js`:

```javascript
describe('SurgeConfigBuilder — DEVICE outbound on custom rule sets', () => {
    it('emits RULE-SET pointing at DEVICE:tower instead of a wrapper group', async () => {
        const customRuleSets = [
            { name: 'MyDev', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'DEVICE:tower' }
        ];
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], [], null, 'en', '', false, true, customRuleSets
        );
        const text = await builder.build();
        // RULE-SET line targets DEVICE:tower
        expect(text).toMatch(/RULE-SET,.*\/geosite\/reddit\.conf,DEVICE:tower/);
        // No "MyDev" wrapper proxy group
        const proxyGroupSection = text.split('[Proxy Group]')[1].split('[Rule]')[0];
        expect(proxyGroupSection).not.toContain('MyDev =');
        // No RULE-SET line targeting "MyDev"
        expect(text).not.toMatch(/RULE-SET,.*reddit\.conf,MyDev/);
    });

    it('preserves no-resolve suffix for ip-type rule sets with DEVICE outbound', async () => {
        const customRuleSets = [
            { name: 'IpDev', provider: 'metacubex', file: 'cn', type: 'ip', outbound: 'DEVICE:tower' }
        ];
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], [], null, 'en', '', false, true, customRuleSets
        );
        const text = await builder.build();
        expect(text).toMatch(/RULE-SET,.*,DEVICE:tower,no-resolve/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/surge-device-outbound.test.js`
Expected: FAIL — current code emits `RULE-SET,<url>,MyDev` and creates a `MyDev = select, DEVICE:tower, ...` group.

- [ ] **Step 3: Skip wrapper group for DEVICE custom rule sets**

In `src/builders/SurgeConfigBuilder.js`, update `addCustomRuleSetGroups` (~line 342). Add a DEVICE skip after the reserved-outbound guard:

```javascript
addCustomRuleSetGroups(proxyList) {
    (this.customRuleSets || []).forEach((item) => {
        if (!item || !item.type) return;
        const name = (item.name && item.name.trim()) || (item.file && item.file.trim());
        if (!name) return;
        if (RESERVED_OUTBOUNDS.has(name.toUpperCase())) return;
        if (isDeviceOutbound(item.outbound)) return;  // emit RULE-SET targeting DEVICE directly
        if (this.hasProxyGroup(name)) return;
        // ... rest unchanged ...
```

Also update `resolveCustomRuleSetDefault` (~line 358) to passthrough DEVICE values (for cases where this method is called even when we end up not creating a group — defensive; cheap):

```javascript
resolveCustomRuleSetDefault(item) {
    const raw = item?.outbound || 'Node Select';
    if (raw === 'DIRECT' || raw === 'REJECT') return raw;
    if (isDeviceOutbound(raw)) return raw;
    return this.t('outboundNames.' + raw);
}
```

- [ ] **Step 4: Emit RULE-SET line with DEVICE policy**

In `src/builders/SurgeConfigBuilder.js`, inside `formatConfig` replace the customRuleSets emission loop (~line 517-528) with:

```javascript
// customRuleSets first — higher priority than built-in rules.
(this.customRuleSets || []).forEach(item => {
    if (!item || !item.type) return;
    const name = (item.name && item.name.trim()) || (item.file && item.file.trim());
    if (!name) return;
    const url = resolveCustomRuleSetUrl(item, 'surge');
    if (!url) return;
    const policy = isDeviceOutbound(item.outbound) ? item.outbound : name;
    if (item.type === 'site') {
        finalConfig.push(`RULE-SET,${url},${policy}`);
    } else {
        finalConfig.push(`RULE-SET,${url},${policy},no-resolve`);
    }
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/surge-device-outbound.test.js`
Expected: All Task 1-3 cases PASS.

- [ ] **Step 6: Full suite check**

Run: `npx vitest run`
Expected: No regressions, including the existing `custom-rule-sets-builders.test.js` that asserts the non-DEVICE happy path still emits `RULE-SET,<url>,<name>`.

- [ ] **Step 7: Commit**

```bash
git add src/builders/SurgeConfigBuilder.js test/surge-device-outbound.test.js
git commit -m "feat(surge): passthrough DEVICE:xxx policy in custom rule sets"
```

---

## Task 4: Clash — filter DEVICE custom rules and rule sets

Clash has no DEVICE equivalent; rules and rule sets with DEVICE outbound must be silently dropped from the YAML output (no rule, no rule-provider, no proxy group).

**Files:**
- Modify: `src/builders/ClashConfigBuilder.js:449-498` (`addCustomRuleGroups`, `addCustomRuleSetGroups`) and `:701-748` (`formatConfig`)
- Test: `test/surge-device-outbound.test.js`

- [ ] **Step 1: Add failing tests**

Append:

```javascript
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import yaml from 'js-yaml';

describe('ClashConfigBuilder — DEVICE outbound is dropped', () => {
    it('drops customRules with DEVICE name from YAML rules', async () => {
        const customRules = [
            { name: 'DEVICE:my-iphone', domain_suffix: 'work.example.com' }
        ];
        const builder = new ClashConfigBuilder(
            SAMPLE, ['Non-China'], customRules, null, 'en', '', false, false, '', '', true, []
        );
        const text = await builder.build();
        expect(text).not.toContain('DEVICE:my-iphone');
        expect(text).not.toContain('work.example.com');
    });

    it('drops customRuleSets with DEVICE outbound — no group, no provider, no rule line', async () => {
        const customRuleSets = [
            { name: 'MyDev', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'DEVICE:tower' }
        ];
        const builder = new ClashConfigBuilder(
            SAMPLE, ['Non-China'], [], null, 'en', '', false, false, '', '', true, customRuleSets
        );
        const text = await builder.build();
        const config = yaml.load(text);
        expect((config['proxy-groups'] || []).find(g => g.name === 'MyDev')).toBeUndefined();
        expect((config['rule-providers'] || {})['MyDev']).toBeUndefined();
        expect(JSON.stringify(config.rules)).not.toContain('MyDev');
        expect(JSON.stringify(config.rules)).not.toContain('DEVICE:tower');
    });

    it('keeps non-DEVICE customRuleSets alongside DEVICE ones', async () => {
        const customRuleSets = [
            { name: 'MyDev',    provider: 'metacubex', file: 'reddit',  type: 'site', outbound: 'DEVICE:tower' },
            { name: 'MyReddit', provider: 'metacubex', file: 'reddit',  type: 'site', outbound: 'Node Select' }
        ];
        const builder = new ClashConfigBuilder(
            SAMPLE, ['Non-China'], [], null, 'en', '', false, false, '', '', true, customRuleSets
        );
        const text = await builder.build();
        const config = yaml.load(text);
        expect((config['rule-providers'] || {})['MyReddit']).toBeDefined();
        expect((config['rule-providers'] || {})['MyDev']).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/surge-device-outbound.test.js`
Expected: FAIL — current code creates a `MyDev` proxy group, registers a `MyDev` rule-provider, and emits a `RULE-SET,MyDev,MyDev` rule line.

- [ ] **Step 3: Add DEVICE guards in `addCustomRule*Groups`**

In `src/builders/ClashConfigBuilder.js`, update both methods. Imports first (~line 3):

```javascript
import { BaseConfigBuilder, RESERVED_OUTBOUNDS, isDeviceOutbound } from './BaseConfigBuilder.js';
```

Then in `addCustomRuleGroups` (~line 449), after the existing reserved-outbound guard:

```javascript
this.customRules.forEach(rule => {
    if (RESERVED_OUTBOUNDS.has(String(rule.name || '').toUpperCase())) return;
    if (isDeviceOutbound(rule.name)) return;  // Surge-only; not representable in Clash
    const name = this.t(`outboundNames.${rule.name}`);
    // ... rest unchanged ...
```

And in `addCustomRuleSetGroups` (~line 478), after the reserved-outbound guard:

```javascript
(this.customRuleSets || []).forEach((item) => {
    if (!item || !item.type) return;
    const name = (item.name && item.name.trim()) || (item.file && item.file.trim());
    if (!name) return;
    if (RESERVED_OUTBOUNDS.has(name.toUpperCase())) return;
    if (isDeviceOutbound(item.outbound)) return;  // Surge-only; drop entirely
    // ... rest unchanged ...
```

- [ ] **Step 4: Filter inputs to `generateRules` / `generateClashRuleSets` in `formatConfig`**

In `src/builders/ClashConfigBuilder.js`, locate `formatConfig` (~line 701). Currently:

```javascript
formatConfig() {
    const rules = this.generateRules();
    const useMrs = supportsMrsFormat(this.userAgent);
    const { site_rule_providers, ip_rule_providers } = generateClashRuleSets(this.selectedRules, this.customRules, useMrs, this.customRuleSets);
    // ...
```

Replace with:

```javascript
formatConfig() {
    const effectiveCustomRules = (this.customRules || []).filter(r => !isDeviceOutbound(r?.name));
    const effectiveCustomRuleSets = (this.customRuleSets || []).filter(r => !isDeviceOutbound(r?.outbound));
    const rules = generateRules(this.selectedRules, effectiveCustomRules, effectiveCustomRuleSets);
    const useMrs = supportsMrsFormat(this.userAgent);
    const { site_rule_providers, ip_rule_providers } = generateClashRuleSets(this.selectedRules, effectiveCustomRules, useMrs, effectiveCustomRuleSets);
    // ... rest unchanged ...
```

This requires `generateRules` to be in scope. The file already imports `{ ... generateRules ... }` from `'../config/index.js'` at line 2, so no new import is needed — verify by reading that line.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/surge-device-outbound.test.js`
Expected: All Task 1-4 cases PASS.

- [ ] **Step 6: Full suite check**

Run: `npx vitest run`
Expected: No regressions, including `clash-builder.test.js` and `custom-rule-sets-*` tests.

- [ ] **Step 7: Commit**

```bash
git add src/builders/ClashConfigBuilder.js test/surge-device-outbound.test.js
git commit -m "feat(clash): drop DEVICE:xxx custom rules and rule sets silently"
```

---

## Task 5: Sing-box — filter DEVICE custom rules and rule sets

Mirrors Task 4 for Sing-box.

**Files:**
- Modify: `src/builders/SingboxConfigBuilder.js:244-290` (`addCustomRuleGroups`, `addCustomRuleSetGroups`) and `:531-553` (top of `formatConfig`)
- Test: `test/surge-device-outbound.test.js`

- [ ] **Step 1: Add failing tests**

Append:

```javascript
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';

describe('SingboxConfigBuilder — DEVICE outbound is dropped', () => {
    it('drops customRules with DEVICE name from route.rules', async () => {
        const customRules = [
            { name: 'DEVICE:my-iphone', domain_suffix: 'work.example.com' }
        ];
        const builder = new SingboxConfigBuilder(
            SAMPLE, ['Non-China'], customRules, null, 'en', '', false, false, '', '', '1.12', true, []
        );
        const config = await builder.build();
        const allRulesJson = JSON.stringify(config.route?.rules || []);
        expect(allRulesJson).not.toContain('DEVICE:my-iphone');
        expect(allRulesJson).not.toContain('work.example.com');
    });

    it('drops customRuleSets with DEVICE outbound — no rule_set tag, no selector, no rule', async () => {
        const customRuleSets = [
            { name: 'MyDev', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'DEVICE:tower' }
        ];
        const builder = new SingboxConfigBuilder(
            SAMPLE, ['Non-China'], [], null, 'en', '', false, false, '', '', '1.12', true, customRuleSets
        );
        const config = await builder.build();
        const ruleSetTags = (config.route?.rule_set || []).map(r => r.tag);
        expect(ruleSetTags).not.toContain('MyDev');
        const selectorTags = (config.outbounds || []).map(o => o.tag);
        expect(selectorTags).not.toContain('MyDev');
        expect(JSON.stringify(config.route?.rules || [])).not.toContain('MyDev');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/surge-device-outbound.test.js`
Expected: FAIL — current code emits a `MyDev` rule_set entry, a `MyDev` selector outbound, and a route rule referencing it.

- [ ] **Step 3: Add DEVICE guards in `addCustomRule*Groups`**

In `src/builders/SingboxConfigBuilder.js`, update imports (~line 3):

```javascript
import { BaseConfigBuilder, RESERVED_OUTBOUNDS, isDeviceOutbound } from './BaseConfigBuilder.js';
```

In `addCustomRuleGroups` (~line 244):

```javascript
this.customRules.forEach(rule => {
    if (RESERVED_OUTBOUNDS.has(String(rule.name || '').toUpperCase())) return;
    if (isDeviceOutbound(rule.name)) return;  // Surge-only; no Sing-box equivalent
    const includeAutoSelect = this.includeAutoSelect && this.hasAutoSelectCandidates(proxyList);
    // ... rest unchanged ...
```

In `addCustomRuleSetGroups` (~line 267):

```javascript
(this.customRuleSets || []).forEach((item) => {
    if (!item || !item.type) return;
    const name = (item.name && item.name.trim()) || (item.file && item.file.trim());
    if (!name) return;
    if (RESERVED_OUTBOUNDS.has(name.toUpperCase())) return;
    if (isDeviceOutbound(item.outbound)) return;  // Surge-only; drop entirely
    // ... rest unchanged ...
```

- [ ] **Step 4: Filter inputs in `formatConfig`**

In `src/builders/SingboxConfigBuilder.js`, top of `formatConfig` (~line 531). Currently:

```javascript
formatConfig() {
    const rules = generateRules(this.selectedRules, this.customRules, this.customRuleSets);
    const { site_rule_sets, ip_rule_sets } = generateRuleSets(this.selectedRules, this.customRules, this.customRuleSets);
    // ...
```

Replace with:

```javascript
formatConfig() {
    const effectiveCustomRules = (this.customRules || []).filter(r => !isDeviceOutbound(r?.name));
    const effectiveCustomRuleSets = (this.customRuleSets || []).filter(r => !isDeviceOutbound(r?.outbound));
    const rules = generateRules(this.selectedRules, effectiveCustomRules, effectiveCustomRuleSets);
    const { site_rule_sets, ip_rule_sets } = generateRuleSets(this.selectedRules, effectiveCustomRules, effectiveCustomRuleSets);
    // ... rest unchanged ...
```

`generateRules` and `generateRuleSets` are already imported at line 2 — confirm.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/surge-device-outbound.test.js`
Expected: All cases through Task 5 PASS.

- [ ] **Step 6: Full suite check**

Run: `npx vitest run`
Expected: No regressions.

- [ ] **Step 7: Commit**

```bash
git add src/builders/SingboxConfigBuilder.js test/surge-device-outbound.test.js
git commit -m "feat(singbox): drop DEVICE:xxx custom rules and rule sets silently"
```

---

## Task 6: Add `outboundSurgeDevices` i18n key to all locales

`src/i18n/index.js` contains four locales (zh-CN, en, fa, ru). Each already has `outboundBuiltIn`, `outboundSelectedRules`, `outboundPriorRulesets`. Add a fourth sibling.

**Files:**
- Modify: `src/i18n/index.js`

- [ ] **Step 1: Add the key to zh-CN (~line 177)**

Find the zh-CN block:

```javascript
outboundBuiltIn: '内置出站',
outboundSelectedRules: '已选规则组',
outboundPriorRulesets: '上方自定义规则集',
```

Add after `outboundPriorRulesets`:

```javascript
outboundSurgeDevices: 'Surge 设备',
```

- [ ] **Step 2: Add the key to en (~line 401-403)**

Find:

```javascript
outboundBuiltIn: 'Built-in outbounds',
...
outboundPriorRulesets: 'Earlier custom rule sets',
```

Add after:

```javascript
outboundSurgeDevices: 'Surge devices',
```

- [ ] **Step 3: Add the key to fa (~line 619-621)**

Find:

```javascript
outboundBuiltIn: 'خروجی‌های داخلی',
...
outboundPriorRulesets: 'مجموعه‌قوانین قبلی',
```

Add after:

```javascript
outboundSurgeDevices: 'دستگاه‌های Surge',
```

- [ ] **Step 4: Add the key to ru (~line 837-839)**

Find:

```javascript
outboundBuiltIn: 'Встроенные',
...
outboundPriorRulesets: 'Предыдущие пользовательские наборы',
```

Add after:

```javascript
outboundSurgeDevices: 'Устройства Surge',
```

- [ ] **Step 5: Sanity check — grep for the key in all four locales**

Run: `grep -n "outboundSurgeDevices" src/i18n/index.js`
Expected: 4 matches.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/index.js
git commit -m "i18n: add outboundSurgeDevices label across all locales"
```

---

## Task 7: New `SurgeDevices` component

Mirrors `CustomRuleSets.jsx` shape: form mode + JSON mode + URL restore listener + change-event dispatch.

**Files:**
- Create: `src/components/SurgeDevices.jsx`

- [ ] **Step 1: Read the existing CustomRuleSets component for reference**

Run: `head -100 src/components/CustomRuleSets.jsx` (no edit; read into context for shape).

- [ ] **Step 2: Create the new component**

Create `src/components/SurgeDevices.jsx`:

```jsx
/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import { ValidatedTextarea } from './ValidatedTextarea.jsx';

export const SurgeDevices = (props) => {
    const { t } = props;

    return (
        <div x-data="surgeDevicesData()" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <i class="fas fa-mobile-alt text-gray-400"></i>
                    {t('surgeDevicesSection')}
                </h3>
            </div>

            <div class="flex flex-col sm:flex-row justify-between items-end sm:items-center mb-6 gap-4">
                <p class="text-sm text-gray-500 dark:text-gray-400">{t('surgeDevicesSectionTooltip')}</p>

                <div class="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button type="button" x-on:click="mode = 'form'"
                        x-bind:class="{'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400 shadow-sm': mode === 'form', 'text-gray-500 dark:text-gray-400': mode !== 'form'}"
                        class="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2">
                        <i class="fas fa-list"></i>
                        {t('customRulesForm')}
                    </button>
                    <button type="button" x-on:click="mode = 'json'"
                        x-bind:class="{'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400 shadow-sm': mode === 'json', 'text-gray-500 dark:text-gray-400': mode !== 'json'}"
                        class="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2">
                        <i class="fas fa-code"></i>
                        {t('customRulesJSON')}
                    </button>
                </div>
            </div>

            {/* Form Mode */}
            <div x-show="mode === 'form'">
                <template x-if="devices.length === 0">
                    <div class="text-center py-12 bg-gray-50 dark:bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <div class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                            <i class="fas fa-plus text-2xl"></i>
                        </div>
                        <p class="text-gray-500 dark:text-gray-400 mb-4">{t('noSurgeDevicesForm')}</p>
                        <button type="button" x-on:click="addDevice()" class="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200 font-medium">
                            {t('addSurgeDevice')}
                        </button>
                    </div>
                </template>

                <div class="space-y-4">
                    <template x-for="(device, index) in devices" x-bind:key="device.__uid || index">
                        <div class="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                            <div class="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                                <h3 class="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                    <span class="w-6 h-6 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs" x-text="index + 1"></span>
                                    {t('surgeDevice')}
                                </h3>
                                <button type="button" x-on:click="removeDevice(index)" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t('surgeDeviceName')}
                                </label>
                                <input type="text" x-model="device.name"
                                    x-on:input="device.name = (device.name || '').replace(/[\s,]+/g, '')"
                                    placeholder="tower"
                                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200" />
                                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('surgeDeviceNameHint')}</p>
                            </div>
                        </div>
                    </template>
                </div>

                <div class="mt-6 flex flex-wrap gap-3">
                    <button type="button" x-on:click="addDevice()" class="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors duration-200 font-medium flex items-center gap-2">
                        <i class="fas fa-plus"></i>
                        {t('addSurgeDevice')}
                    </button>
                    <button type="button" x-on:click="clearAll()" x-show="devices.length > 0" class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors duration-200 font-medium flex items-center gap-2">
                        <i class="fas fa-trash"></i>
                        {t('clearAll')}
                    </button>
                </div>
            </div>

            {/* JSON Mode */}
            <div x-show="mode === 'json'">
                <textarea x-model="jsonContent" rows={8} class="w-full px-4 py-2 font-mono text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder='[{"name":"tower"}]'></textarea>
                <template x-if="jsonError">
                    <p class="mt-2 text-sm text-red-500" x-text="jsonError"></p>
                </template>
            </div>

            {/* Hidden input for form submission */}
            <input type="hidden" name="surgeDevices" x-bind:value="JSON.stringify(devices, (k, v) => k === '__uid' ? undefined : v)" />

            <script dangerouslySetInnerHTML={{
                __html: `
                const sdUid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);

                function surgeDevicesData() {
                    return {
                        mode: 'form',
                        devices: [],
                        jsonContent: '[]',
                        jsonError: null,

                        init() {
                            this.$watch('devices', (value) => {
                                if (this.mode === 'form') {
                                    this.jsonContent = JSON.stringify(value, null, 2);
                                }
                                window.dispatchEvent(new CustomEvent('surge-devices-changed'));
                            });

                            this.$watch('jsonContent', (value) => {
                                if (this.mode === 'json') {
                                    try {
                                        const parsed = JSON.parse(value);
                                        if (Array.isArray(parsed)) {
                                            this.devices = parsed
                                                .map(d => ({ __uid: d.__uid || sdUid(), name: (d.name || '').toString().replace(/[\\s,]+/g, '') }))
                                                .filter(d => d.name);
                                            this.jsonError = null;
                                        } else {
                                            this.jsonError = '${t('mustBeArray')}';
                                        }
                                    } catch (e) {
                                        this.jsonError = e.message;
                                    }
                                }
                            });

                            window.addEventListener('restore-surge-devices', (event) => {
                                if (event.detail && Array.isArray(event.detail.devices)) {
                                    this.devices = event.detail.devices
                                        .map(d => ({ __uid: d.__uid || sdUid(), name: (d.name || '').toString().replace(/[\\s,]+/g, '') }))
                                        .filter(d => d.name);
                                    this.jsonContent = JSON.stringify(this.devices, null, 2);
                                }
                            });
                        },

                        addDevice() {
                            this.devices.push({ __uid: sdUid(), name: '' });
                        },

                        removeDevice(index) {
                            this.devices.splice(index, 1);
                        },

                        clearAll() {
                            if (!confirm('${t('confirmClearAllSurgeDevices')}')) return;
                            this.devices = [];
                            this.jsonContent = '[]';
                        }
                    }
                }
                `
            }} />
        </div>
    );
};
```

- [ ] **Step 3: Add the seven new i18n keys (zh-CN, en, fa, ru)**

In `src/i18n/index.js`, add to each locale block (next to the other "customRules*" labels):

zh-CN:
```javascript
surgeDevicesSection: 'Surge 设备',
surgeDevicesSectionTooltip: '声明 Surge Ponte 设备名,声明后可在自定义规则/规则集的出站下拉中选择 DEVICE:<名称>',
surgeDevice: 'Surge 设备',
surgeDeviceName: '设备名',
surgeDeviceNameHint: '不能包含空格或逗号(Surge 标识符限制)',
addSurgeDevice: '添加 Surge 设备',
noSurgeDevicesForm: '暂无 Surge 设备',
confirmClearAllSurgeDevices: '确定清空所有 Surge 设备?',
```

en:
```javascript
surgeDevicesSection: 'Surge Devices',
surgeDevicesSectionTooltip: 'Declare Surge Ponte device names. Declared names appear as DEVICE:<name> in the custom-rule and rule-set outbound dropdowns.',
surgeDevice: 'Surge device',
surgeDeviceName: 'Device name',
surgeDeviceNameHint: 'No spaces or commas (Surge identifier rules).',
addSurgeDevice: 'Add Surge device',
noSurgeDevicesForm: 'No Surge devices yet',
confirmClearAllSurgeDevices: 'Clear all Surge devices?',
```

fa:
```javascript
surgeDevicesSection: 'دستگاه‌های Surge',
surgeDevicesSectionTooltip: 'نام دستگاه‌های Surge Ponte را اعلام کنید. نام‌های اعلام‌شده به‌صورت DEVICE:<نام> در منوی خروجی قواعد و مجموعه‌قواعد سفارشی ظاهر می‌شوند.',
surgeDevice: 'دستگاه Surge',
surgeDeviceName: 'نام دستگاه',
surgeDeviceNameHint: 'بدون فاصله یا ویرگول (طبق قواعد Surge).',
addSurgeDevice: 'افزودن دستگاه Surge',
noSurgeDevicesForm: 'هنوز دستگاهی اعلام نشده است',
confirmClearAllSurgeDevices: 'همه دستگاه‌های Surge پاک شوند؟',
```

ru:
```javascript
surgeDevicesSection: 'Устройства Surge',
surgeDevicesSectionTooltip: 'Объявите имена устройств Surge Ponte. Объявленные имена появятся как DEVICE:<имя> в выпадающих списках исходящих для пользовательских правил и наборов правил.',
surgeDevice: 'Устройство Surge',
surgeDeviceName: 'Имя устройства',
surgeDeviceNameHint: 'Без пробелов и запятых (правила идентификаторов Surge).',
addSurgeDevice: 'Добавить устройство Surge',
noSurgeDevicesForm: 'Пока нет устройств Surge',
confirmClearAllSurgeDevices: 'Очистить все устройства Surge?',
```

- [ ] **Step 4: Sanity check — grep all eight new keys**

Run: `for k in surgeDevicesSection surgeDevicesSectionTooltip surgeDevice surgeDeviceName surgeDeviceNameHint addSurgeDevice noSurgeDevicesForm confirmClearAllSurgeDevices; do echo "$k:"; grep -c "$k" src/i18n/index.js; done`
Expected: each key has 4 matches (one per locale). `surgeDevice` may match more because it is a substring of the others — accept anything ≥ 4.

- [ ] **Step 5: Commit**

```bash
git add src/components/SurgeDevices.jsx src/i18n/index.js
git commit -m "feat(ui): add SurgeDevices component to declare DEVICE:xxx outbounds"
```

---

## Task 8: Wire `<SurgeDevices>` into the form

**Files:**
- Modify: `src/components/Form.jsx`

- [ ] **Step 1: Locate where `<CustomRuleSets>` is rendered**

Run: `grep -n "CustomRuleSets" src/components/Form.jsx`

- [ ] **Step 2: Import and render `<SurgeDevices>` directly above `<CustomRuleSets>`**

In `src/components/Form.jsx`, add the import next to the existing `CustomRuleSets` import:

```javascript
import { SurgeDevices } from './SurgeDevices.jsx';
```

In the JSX where `<CustomRuleSets t={t} />` (or equivalent) is rendered, insert immediately before it:

```jsx
<SurgeDevices t={t} />
```

- [ ] **Step 3: Smoke-test the dev render**

Run: `npx vitest run` (full suite includes a `worker.test.js` that exercises the rendered HTML).
Expected: PASS. If any test cares about the new section's presence, it will fail loudly — extend the test only if the failure points at a real regression, not a string mismatch.

- [ ] **Step 4: Commit**

```bash
git add src/components/Form.jsx
git commit -m "feat(ui): render SurgeDevices section above CustomRuleSets"
```

---

## Task 9: Show DEVICE options in CustomRules and CustomRuleSets dropdowns

Both components need:
1. A new optgroup populated from declared Surge devices
2. A `surgeDeviceNames()` helper reading the hidden `surgeDevices` input
3. Validator extension to accept `DEVICE:<declared-name>`
4. Reactivity wired to `surge-devices-changed`

**Files:**
- Modify: `src/components/CustomRules.jsx`
- Modify: `src/components/CustomRuleSets.jsx`

- [ ] **Step 1: Add the optgroup in `CustomRules.jsx`**

In `src/components/CustomRules.jsx`, locate the outbound `<select>` (~line 96-118). Add a new optgroup directly after the "outboundPriorRulesets" optgroup (~line 117):

```jsx
<optgroup label={t('outboundSurgeDevices')} x-show="surgeDeviceNames().length > 0">
    <template x-for="n in surgeDeviceNames()" x-bind:key="n">
        <option x-bind:value="'DEVICE:' + n" x-text="'DEVICE:' + n"></option>
    </template>
</optgroup>
```

- [ ] **Step 2: Add helpers and validator in `CustomRules.jsx` Alpine block**

In the same file, find the inline `<script>` (~line 295-444). Inside `customRulesData()`, add:

A new reactive counter near `ruleSetsVersion`:

```javascript
surgeDevicesVersion: 0,
```

A `surgeDeviceNames()` method below `customRuleSetNames()`:

```javascript
surgeDeviceNames() {
    void this.surgeDevicesVersion;
    const el = document.querySelector('input[name="surgeDevices"]');
    if (!el || !el.value) return [];
    try {
        const parsed = JSON.parse(el.value);
        if (!Array.isArray(parsed)) return [];
        return Array.from(new Set(parsed.map(d => d && d.name).filter(Boolean)));
    } catch { return []; }
},
```

Update `isValidOutbound`:

```javascript
isValidOutbound(value) {
    if (!value) return false;
    if (CR_STATIC_OUTBOUND_VALUES.includes(value)) return true;
    const sel = readFormSelectedRules();
    if (sel.includes(value)) return true;
    if (this.customRuleSetNames().includes(value)) return true;
    if (typeof value === 'string' && value.startsWith('DEVICE:')) {
        const name = value.slice(7);
        if (this.surgeDeviceNames().includes(name)) return true;
    }
    return false;
},
```

Add the listener inside `init()`, alongside the existing `selected-rules-changed` and `custom-rulesets-changed` listeners:

```javascript
window.addEventListener('surge-devices-changed', () => {
    this.surgeDevicesVersion++;
    this.validateOutbounds();
});
```

- [ ] **Step 3: Apply the same changes to `CustomRuleSets.jsx`**

In `src/components/CustomRuleSets.jsx`:
- Add the optgroup (~after line 156, after `outboundPriorRulesets`):
  ```jsx
  <optgroup label={t('outboundSurgeDevices')} x-show="surgeDeviceNames().length > 0">
      <template x-for="n in surgeDeviceNames()" x-bind:key="n">
          <option x-bind:value="'DEVICE:' + n" x-text="'DEVICE:' + n"></option>
      </template>
  </optgroup>
  ```
- Add the same `surgeDevicesVersion` counter, the same `surgeDeviceNames()` method, the same `DEVICE:` branch in `isValidOutbound`, and the same `surge-devices-changed` listener — all in the Alpine `customRuleSetsData()` function (mirroring the additions in Step 2).

- [ ] **Step 4: Smoke test**

Run: `npx vitest run`
Expected: All tests PASS (these are pure UI changes; existing tests should be unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/components/CustomRules.jsx src/components/CustomRuleSets.jsx
git commit -m "feat(ui): show declared Surge devices in custom-rule and rule-set outbound dropdowns"
```

---

## Task 10: Persist `surgeDevices` in subconverter URLs

`formLogic.js` currently encodes `customRules` and `customRuleSets` into the URL and decodes them back on rehydration. Add the same for `surgeDevices`. Decode order must be `surgeDevices → customRuleSets → customRules` so consumers see populated declarations.

**Files:**
- Modify: `src/components/formLogic.js`
- Test: `test/surge-device-formlogic.test.js` (create)

- [ ] **Step 1: Write failing test (source-string assertions)**

The existing `formLogic.test.js` does not run the Alpine `formData()` in a real DOM — it inspects `formLogicFn.toString()` for source patterns and uses the `Function` constructor for light runtime checks. Follow the same pattern.

Create `test/surge-device-formlogic.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { formLogicFn } from '../src/components/formLogic.js';

describe('formLogic — surgeDevices URL persistence', () => {
    const fnString = formLogicFn.toString();

    it('getSubconverterUrl encodes the hidden surgeDevices input into ?surgeDevices=...', () => {
        // Look for the encode block
        expect(fnString).toMatch(/input\[name="surgeDevices"\]/);
        expect(fnString).toMatch(/params\.append\(\s*['"]surgeDevices['"]\s*,/);
    });

    it('populateFormFromUrl decodes ?surgeDevices=... and dispatches restore-surge-devices', () => {
        expect(fnString).toMatch(/params\.get\(\s*['"]surgeDevices['"]\s*\)/);
        expect(fnString).toMatch(/['"]restore-surge-devices['"]/);
    });

    it('decodes surgeDevices BEFORE customRuleSets and customRules', () => {
        const surgeIdx = fnString.indexOf("'restore-surge-devices'");
        const ruleSetsIdx = fnString.indexOf("'restore-custom-rule-sets'");
        const rulesIdx = fnString.indexOf("'restore-custom-rules'");
        expect(surgeIdx).toBeGreaterThan(-1);
        expect(ruleSetsIdx).toBeGreaterThan(-1);
        expect(rulesIdx).toBeGreaterThan(-1);
        expect(surgeIdx).toBeLessThan(ruleSetsIdx);
        expect(surgeIdx).toBeLessThan(rulesIdx);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/surge-device-formlogic.test.js`
Expected: FAIL — `formLogic.js` does not yet contain `surgeDevices` encode/decode blocks.

- [ ] **Step 3: Add encode block in `getSubconverterUrl`**

In `src/components/formLogic.js`, locate `getSubconverterUrl` (~line 208). After the existing `customRuleSets` try/catch (~line 235), append:

```javascript
// Include surgeDevices when available
try {
    const surgeDevicesInput = document.querySelector('input[name="surgeDevices"]');
    const surgeDevices = surgeDevicesInput && surgeDevicesInput.value ? JSON.parse(surgeDevicesInput.value) : [];
    if (Array.isArray(surgeDevices) && surgeDevices.length > 0) {
        params.append('surgeDevices', JSON.stringify(surgeDevices));
    }
} catch { }
```

- [ ] **Step 4: Add decode block in `populateFormFromUrl`**

In `src/components/formLogic.js`, locate `populateFormFromUrl` (~line 570). Insert the surgeDevices decode block **before** the `customRuleSets` decode block (~line 609) so declarations land in the DOM input before any `validateOutbounds()` runs in CustomRuleSets:

```javascript
// Extract surgeDevices (must precede customRuleSets and customRules so validators see them)
const surgeDevices = params.get('surgeDevices');
if (surgeDevices) {
    try {
        const parsed = JSON.parse(surgeDevices);
        if (Array.isArray(parsed) && parsed.length > 0) {
            window.dispatchEvent(new CustomEvent('restore-surge-devices', {
                detail: { devices: parsed }
            }));
        }
    } catch (e) {
        console.warn('Failed to parse surgeDevices:', e);
    }
}
```

- [ ] **Step 5: Verify decode order**

Run: `grep -n "restore-surge-devices\|restore-custom-rule-sets\|restore-custom-rules" src/components/formLogic.js`
Expected: line numbers in increasing order — `restore-surge-devices` first, `restore-custom-rule-sets` next, `restore-custom-rules` last.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/formLogic.js test/surge-device-formlogic.test.js
git commit -m "feat(formLogic): persist surgeDevices in subconverter URL"
```

---

## Task 11: Final integration sanity check

- [ ] **Step 1: Run the full suite once more**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Smoke-build a Surge config end-to-end**

Add an ad-hoc verification snippet at the bottom of `test/surge-device-outbound.test.js`:

```javascript
describe('end-to-end DEVICE wiring', () => {
    it('Surge config containing both DEVICE custom rule and DEVICE custom rule set is well-formed', async () => {
        const customRules = [{ name: 'DEVICE:my-iphone', domain_suffix: 'work.com' }];
        const customRuleSets = [
            { name: 'MyDev', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'DEVICE:tower' },
            { name: 'MyReddit', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'Node Select' }
        ];
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], customRules, null, 'en', '', false, true, customRuleSets
        );
        const text = await builder.build();

        // DEVICE custom rule emitted with passthrough policy
        expect(text).toContain('DOMAIN-SUFFIX,work.com,DEVICE:my-iphone');
        // DEVICE custom rule set emitted with DEVICE policy
        expect(text).toMatch(/RULE-SET,.*reddit\.conf,DEVICE:tower/);
        // Non-DEVICE custom rule set still uses its name
        expect(text).toMatch(/RULE-SET,.*reddit\.conf,MyReddit/);
        // No wrapper proxy group for either DEVICE entity
        const proxyGroupSection = text.split('[Proxy Group]')[1].split('[Rule]')[0];
        expect(proxyGroupSection).not.toContain('DEVICE:my-iphone =');
        expect(proxyGroupSection).not.toContain('MyDev =');
        // Non-DEVICE wrapper still present
        expect(proxyGroupSection).toContain('MyReddit =');
    });
});
```

Run: `npx vitest run test/surge-device-outbound.test.js`
Expected: All PASS.

- [ ] **Step 3: Commit and announce completion**

```bash
git add test/surge-device-outbound.test.js
git commit -m "test(surge): end-to-end DEVICE wiring across custom rules and rule sets"
```

---

## Self-Review Checklist (informational — for plan author)

- Spec coverage:
  - "Surge Devices" UI section → Task 7
  - DEVICE optgroup in custom-rule / rule-set dropdowns → Task 9
  - Validator extension → Task 9 (Steps 2–3)
  - URL persistence (encode + decode + ordering) → Task 10
  - `restore-surge-devices` listener in SurgeDevices.jsx → Task 7 (script body)
  - `surge-devices-changed` dispatch → Task 7 (script body, watchers)
  - Surge passthrough on custom rules → Task 2
  - Surge passthrough on custom rule sets → Task 3
  - Clash skip → Task 4
  - Sing-box skip → Task 5
  - i18n key → Task 6 + Task 7 (additional UI labels)
  - `isDeviceOutbound` helper → Task 1
  - Test coverage in all three builders → Tasks 2-5; end-to-end in Task 11

- No placeholders, no TBDs, no "implement appropriate X". Each step ships either runnable code or a single concrete edit.

- Type / name consistency:
  - Helper name `isDeviceOutbound` consistent across imports
  - Component is `SurgeDevices` (PascalCase) — matches `CustomRuleSets` pattern
  - Form input name `surgeDevices` consistent across encode/decode/UI helpers
  - Event names: `surge-devices-changed` (mutation), `restore-surge-devices` (URL rehydrate) — matches existing kebab-case pattern
