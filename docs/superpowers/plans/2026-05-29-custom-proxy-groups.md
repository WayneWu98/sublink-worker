# Custom Proxy Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users define named proxy groups (自定义策略组) — choosing type (select/url-test/fallback/load-balance) and members (a node-name regex filter plus references to other groups / DIRECT / REJECT) — that work across Clash, sing-box, and Surge and are usable as routing targets.

**Architecture:** A pure server-side helper resolves each group's regex filter against the parsed node list and validates its references; each of the three config builders gains an `addCustomProxyGroups()` method that emits the group in its native format with per-platform type degradation. Group **names** are precomputed early so existing groups (Node Select, rule groups, Fall Back) can list them; the group **objects** are emitted last so their own references can be validated against every other group. A new Alpine.js form component collects the groups; `formLogic.js` serializes them into the share URL and restores them from it.

**Tech Stack:** JavaScript (ES modules), hono/jsx (server-rendered Alpine.js components), vitest with `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-05-29-custom-proxy-groups-design.md`

---

## File Structure

**New files:**
- `src/builders/helpers/customProxyGroups.js` — pure helpers: type mapping, sanitize/dedup, member resolution.
- `src/components/CustomProxyGroups.jsx` — the form section (mirrors `CustomRuleSets.jsx`).
- `test/custom-proxy-groups-members.test.js` — unit tests for the helper.
- `test/custom-proxy-groups-builders.test.js` — e2e per-platform emission + type degradation.
- `test/custom-proxy-groups-restore.test.js` — `formLogicFn.toString()` serialization/restore checks (mirrors `surge-device-formlogic.test.js`).
- `test/custom-proxy-groups-e2e.test.js` — full round-trip: filter resolution, refs, Fall Back integration, empty-group drop.

**Modified files:**
- `src/builders/helpers/groupBuilder.js` — add `customProxyGroupNames` param to the 3 member builders.
- `src/builders/BaseConfigBuilder.js` — constructor param, `addSelectors()` ordering, default `addCustomProxyGroups()` no-op.
- `src/builders/ClashConfigBuilder.js` — constructor param, `addCustomProxyGroups()`, thread names into member builders.
- `src/builders/SingboxConfigBuilder.js` — same.
- `src/builders/SurgeConfigBuilder.js` — same.
- `src/app/createApp.jsx` — parse `customProxyGroups`, pass to all 3 builders, relax `parseFallbackOutbound`.
- `src/components/formLogic.js` — 2 serialization spots, restore dispatch, fallback restore relax, advanced-expand, `customProxyGroupNames()` accessor.
- `src/components/Form.jsx` — import + render component, Fall Back dropdown optgroup.
- `src/components/CustomRules.jsx` — outbound dropdown optgroup + sibling-read.
- `src/components/CustomRuleSets.jsx` — outbound dropdown optgroup + sibling-read.
- `src/i18n/index.js` — new UI strings in every language block.

---

## Task 1: Pure helper — type mapping, sanitize, member resolution

**Files:**
- Create: `src/builders/helpers/customProxyGroups.js`
- Test: `test/custom-proxy-groups-members.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/custom-proxy-groups-members.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
    mapGroupType,
    isAutoType,
    sanitizeCustomProxyGroups,
    resolveCustomProxyGroupMembers,
} from '../src/builders/helpers/customProxyGroups.js';

describe('mapGroupType', () => {
    it('maps every type natively for clash', () => {
        expect(mapGroupType('select', 'clash')).toBe('select');
        expect(mapGroupType('url-test', 'clash')).toBe('url-test');
        expect(mapGroupType('fallback', 'clash')).toBe('fallback');
        expect(mapGroupType('load-balance', 'clash')).toBe('load-balance');
    });
    it('degrades fallback/load-balance to urltest for singbox', () => {
        expect(mapGroupType('select', 'singbox')).toBe('selector');
        expect(mapGroupType('url-test', 'singbox')).toBe('urltest');
        expect(mapGroupType('fallback', 'singbox')).toBe('urltest');
        expect(mapGroupType('load-balance', 'singbox')).toBe('urltest');
    });
    it('degrades load-balance to url-test for surge', () => {
        expect(mapGroupType('fallback', 'surge')).toBe('fallback');
        expect(mapGroupType('load-balance', 'surge')).toBe('url-test');
    });
    it('falls back to select for an unknown type', () => {
        expect(mapGroupType('garbage', 'clash')).toBe('select');
        expect(mapGroupType('garbage', 'singbox')).toBe('selector');
    });
});

describe('isAutoType', () => {
    it('is true for auto native types, false for select/selector', () => {
        expect(isAutoType('url-test')).toBe(true);
        expect(isAutoType('urltest')).toBe(true);
        expect(isAutoType('fallback')).toBe(true);
        expect(isAutoType('load-balance')).toBe(true);
        expect(isAutoType('select')).toBe(false);
        expect(isAutoType('selector')).toBe(false);
    });
});

describe('sanitizeCustomProxyGroups', () => {
    it('keeps valid groups and applies defaults', () => {
        const out = sanitizeCustomProxyGroups([
            { name: 'HK', type: 'url-test', filter: 'HK' },
        ]);
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({
            name: 'HK', type: 'url-test', filter: 'HK',
            excludeFilter: '', proxies: [],
            testUrl: 'http://www.gstatic.com/generate_204', interval: 300,
        });
    });
    it('drops empty names, reserved names, DEVICE: names, and duplicates', () => {
        const out = sanitizeCustomProxyGroups([
            { name: '  ', type: 'select' },
            { name: 'DIRECT', type: 'select' },
            { name: 'DEVICE:iPhone', type: 'select' },
            { name: 'Dup', type: 'select' },
            { name: 'Dup', type: 'url-test' },
        ]);
        expect(out.map(g => g.name)).toEqual(['Dup']);
    });
    it('drops names colliding with existing group names', () => {
        const out = sanitizeCustomProxyGroups([{ name: 'Taken', type: 'select' }], ['Taken']);
        expect(out).toHaveLength(0);
    });
    it('coerces invalid type to select and non-array proxies to []', () => {
        const out = sanitizeCustomProxyGroups([{ name: 'X', type: 'weird', proxies: 'no' }]);
        expect(out[0].type).toBe('select');
        expect(out[0].proxies).toEqual([]);
    });
});

describe('resolveCustomProxyGroupMembers', () => {
    const proxyList = ['HK-1', 'HK-2', 'US-1', 'JP-expired'];
    const identity = (raw) => (raw === 'DIRECT' || raw === 'REJECT') ? raw : raw; // literal resolver
    const validRefSet = new Set([...proxyList, 'Node Select', 'DIRECT', 'REJECT', 'OtherGroup']);

    it('includes filter matches and excludes excludeFilter matches', () => {
        const { members, empty } = resolveCustomProxyGroupMembers(
            { name: 'HK', filter: 'HK|JP', excludeFilter: 'expired', proxies: [] },
            { proxyList, resolveRef: identity, validRefSet });
        expect(members).toEqual(['HK-1', 'HK-2']);
        expect(empty).toBe(false);
    });
    it('resolves valid refs, drops invalid refs and self-references', () => {
        const { members } = resolveCustomProxyGroupMembers(
            { name: 'Sel', filter: '', proxies: ['Node Select', 'Ghost', 'Sel', 'DIRECT'] },
            { proxyList, resolveRef: identity, validRefSet });
        expect(members).toEqual(['Node Select', 'DIRECT']);
    });
    it('reports empty when nothing matches and no valid refs', () => {
        const { members, empty } = resolveCustomProxyGroupMembers(
            { name: 'None', filter: 'NOPE', proxies: ['Ghost'] },
            { proxyList, resolveRef: identity, validRefSet });
        expect(members).toEqual([]);
        expect(empty).toBe(true);
    });
    it('treats an invalid regex as no filter', () => {
        const { members, empty } = resolveCustomProxyGroupMembers(
            { name: 'Bad', filter: '(', proxies: ['DIRECT'] },
            { proxyList, resolveRef: identity, validRefSet });
        expect(members).toEqual(['DIRECT']);
        expect(empty).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/custom-proxy-groups-members.test.js`
Expected: FAIL — "Failed to resolve import ... customProxyGroups.js" / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/builders/helpers/customProxyGroups.js`:

```js
import { RESERVED_OUTBOUNDS } from '../BaseConfigBuilder.js';
import { uniqueNames } from './groupBuilder.js';

const VALID_TYPES = new Set(['select', 'url-test', 'fallback', 'load-balance']);

// Native group type per platform for each requested type.
// sing-box only has selector/urltest; Surge has no load-balance.
const TYPE_MAP = {
    clash:   { 'select': 'select',   'url-test': 'url-test', 'fallback': 'fallback', 'load-balance': 'load-balance' },
    singbox: { 'select': 'selector', 'url-test': 'urltest',  'fallback': 'urltest',  'load-balance': 'urltest' },
    surge:   { 'select': 'select',   'url-test': 'url-test', 'fallback': 'fallback', 'load-balance': 'url-test' },
};

const DEFAULT_TEST_URL = 'http://www.gstatic.com/generate_204';

export function mapGroupType(userType, platform) {
    const t = VALID_TYPES.has(userType) ? userType : 'select';
    return TYPE_MAP[platform][t];
}

// True iff the native type auto-tests members (needs url/interval); false for plain select/selector.
export function isAutoType(nativeType) {
    return nativeType === 'url-test' || nativeType === 'urltest'
        || nativeType === 'fallback' || nativeType === 'load-balance';
}

function safeRegExp(pattern) {
    if (typeof pattern !== 'string' || pattern.trim() === '') return null;
    try { return new RegExp(pattern); } catch { return null; }
}

// Validate + dedup raw user input into clean descriptors. `existingNames` are
// names already taken by other (built-in/rule/ruleset) groups, to avoid collisions.
export function sanitizeCustomProxyGroups(rawGroups, existingNames = []) {
    const seen = new Set(
        (existingNames || []).map(n => (typeof n === 'string' ? n.trim() : n)).filter(Boolean)
    );
    const out = [];
    (Array.isArray(rawGroups) ? rawGroups : []).forEach(g => {
        if (!g || typeof g !== 'object') return;
        const name = typeof g.name === 'string' ? g.name.trim() : '';
        if (!name) return;
        if (RESERVED_OUTBOUNDS.has(name.toUpperCase())) return;
        if (name.startsWith('DEVICE:')) return;
        if (seen.has(name)) return;
        seen.add(name);
        out.push({
            name,
            type: VALID_TYPES.has(g.type) ? g.type : 'select',
            filter: typeof g.filter === 'string' ? g.filter : '',
            excludeFilter: typeof g.excludeFilter === 'string' ? g.excludeFilter : '',
            proxies: Array.isArray(g.proxies) ? g.proxies.filter(p => typeof p === 'string') : [],
            testUrl: (typeof g.testUrl === 'string' && g.testUrl) ? g.testUrl : DEFAULT_TEST_URL,
            interval: Number.isFinite(g.interval) ? g.interval : 300,
        });
    });
    return out;
}

// Resolve a group's final member list. `resolveRef(raw)` maps a raw reference to
// its emitted (possibly translated) name; `validRefSet` is the set of acceptable
// resolved member names (real proxies + emitted group names + DIRECT/REJECT).
export function resolveCustomProxyGroupMembers(group, { proxyList = [], resolveRef, validRefSet }) {
    const filterRe = safeRegExp(group.filter);
    const excludeRe = safeRegExp(group.excludeFilter);
    const matched = filterRe
        ? proxyList.filter(n => filterRe.test(n) && !(excludeRe && excludeRe.test(n)))
        : [];
    const refs = [];
    (group.proxies || []).forEach(raw => {
        const resolved = resolveRef ? resolveRef(raw) : raw;
        if (!resolved) return;
        if (resolved === group.name) return;                       // drop self-reference
        if (validRefSet && !validRefSet.has(resolved)) return;     // drop invalid reference
        refs.push(resolved);
    });
    const members = uniqueNames([...matched, ...refs]);
    return { members, empty: members.length === 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/custom-proxy-groups-members.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/builders/helpers/customProxyGroups.js test/custom-proxy-groups-members.test.js
git commit -m "feat(proxy-groups): add custom proxy group resolution helper"
```

---

## Task 2: Extend member builders with `customProxyGroupNames`

**Files:**
- Modify: `src/builders/helpers/groupBuilder.js`
- Test: `test/custom-proxy-groups-members.test.js` (append a block)

- [ ] **Step 1: Write the failing test**

Append to `test/custom-proxy-groups-members.test.js`:

```js
import {
    buildNodeSelectMembers,
    buildSelectorMembers,
    buildCustomRuleMembers,
} from '../src/builders/helpers/groupBuilder.js';

describe('member builders include customProxyGroupNames', () => {
    const t = (k) => k.startsWith('outboundNames.') ? k.slice('outboundNames.'.length) : k;

    it('buildNodeSelectMembers inserts custom group names after the auto anchor', () => {
        const out = buildNodeSelectMembers({
            proxyList: ['N1'], translator: t, includeAutoSelect: true,
            customProxyGroupNames: ['HK Auto'],
        });
        expect(out).toContain('HK Auto');
        expect(out.indexOf('HK Auto')).toBeLessThan(out.indexOf('N1'));
        expect(out.indexOf('Auto Select')).toBeLessThan(out.indexOf('HK Auto'));
    });

    it('buildSelectorMembers and buildCustomRuleMembers include custom group names', () => {
        const sel = buildSelectorMembers({ proxyList: ['N1'], translator: t, customProxyGroupNames: ['G'] });
        const cr = buildCustomRuleMembers({ proxyList: ['N1'], translator: t, customProxyGroupNames: ['G'] });
        expect(sel).toContain('G');
        expect(cr).toContain('G');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/custom-proxy-groups-members.test.js -t "member builders include"`
Expected: FAIL — custom names not present in output.

- [ ] **Step 3: Write minimal implementation**

In `src/builders/helpers/groupBuilder.js`, modify the three exported builders. Replace `buildNodeSelectMembers` (currently lines 24-40):

```js
export function buildNodeSelectMembers({ proxyList = [], translator, groupByCountry = false, manualGroupName, countryGroupNames = [], includeAutoSelect = true, includeReject = true, customProxyGroupNames = [] }) {
    if (!translator) {
        throw new Error('buildNodeSelectMembers requires a translator function');
    }
    const autoName = translator('outboundNames.Auto Select');
    const base = groupByCountry
        ? [
            ...(includeAutoSelect ? [autoName] : []),
            ...customProxyGroupNames,
            ...(manualGroupName ? [manualGroupName] : []),
            ...countryGroupNames
        ]
        : [
            ...(includeAutoSelect ? [autoName] : []),
            ...customProxyGroupNames,
            ...proxyList
        ];
    return withDirectReject(base, { includeReject });
}
```

Replace `buildSelectorMembers` (currently lines 42-58):

```js
export function buildSelectorMembers({ proxyList = [], translator, groupByCountry = false, manualGroupName, countryGroupNames = [], includeAutoSelect = true, includeReject = true, customProxyGroupNames = [] }) {
    if (!translator) {
        throw new Error('buildSelectorMembers requires a translator function');
    }
    const base = groupByCountry
        ? [
            translator('outboundNames.Node Select'),
            ...(includeAutoSelect ? [translator('outboundNames.Auto Select')] : []),
            ...customProxyGroupNames,
            ...(manualGroupName ? [manualGroupName] : []),
            ...countryGroupNames
        ]
        : [
            translator('outboundNames.Node Select'),
            ...customProxyGroupNames,
            ...proxyList
        ];
    return withDirectReject(base, { includeReject });
}
```

Replace `buildCustomRuleMembers` (currently lines 60-70):

```js
export function buildCustomRuleMembers({ proxyList = [], translator, manualGroupName, includeAutoSelect = true, includeReject = true, customProxyGroupNames = [] }) {
    if (!translator) {
        throw new Error('buildCustomRuleMembers requires a translator function');
    }
    return withDirectReject([
        translator('outboundNames.Node Select'),
        ...(includeAutoSelect ? [translator('outboundNames.Auto Select')] : []),
        ...customProxyGroupNames,
        ...(manualGroupName ? [manualGroupName] : []),
        ...proxyList
    ], { includeReject });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/custom-proxy-groups-members.test.js`
Expected: PASS. Also run `npx vitest run test/country-group.test.js test/clash-builder.test.js` — Expected: PASS (defaults keep old behavior since `customProxyGroupNames` defaults to `[]`).

- [ ] **Step 5: Commit**

```bash
git add src/builders/helpers/groupBuilder.js test/custom-proxy-groups-members.test.js
git commit -m "feat(proxy-groups): thread customProxyGroupNames through member builders"
```

---

## Task 3: BaseConfigBuilder — constructor param, ordering, no-op hook

**Files:**
- Modify: `src/builders/BaseConfigBuilder.js:27-40` (constructor), `:397-415` (addSelectors), add a new method near `:372-375`.

- [ ] **Step 1: Modify the constructor**

In `src/builders/BaseConfigBuilder.js`, change the constructor signature (line 27) and add the field. Replace:

```js
    constructor(inputString, baseConfig, lang, userAgent, groupByCountry = false, includeAutoSelect = true) {
        this.inputString = inputString;
        this.config = deepCopy(baseConfig);
        this.customRules = [];
        this.selectedRules = [];
```

with:

```js
    constructor(inputString, baseConfig, lang, userAgent, groupByCountry = false, includeAutoSelect = true) {
        this.inputString = inputString;
        this.config = deepCopy(baseConfig);
        this.customRules = [];
        this.selectedRules = [];
        this.customProxyGroups = [];     // raw user input; child sets the real value
        this.customProxyGroupNames = []; // computed in addSelectors()
```

- [ ] **Step 2: Add the default no-op hook**

Replace the existing `addCustomRuleSetGroups` default (lines 372-375) — keep it and add a sibling immediately after:

```js
    addCustomRuleSetGroups(proxyList) {
        // Default no-op; child classes override to register a selector
        // per customRuleSets entry so traffic can be routed to it.
    }

    addCustomProxyGroups(proxyList) {
        // Default no-op; child classes override to emit user-defined proxy groups.
    }
```

- [ ] **Step 3: Update addSelectors ordering**

Replace `addSelectors()` (lines 397-415):

```js
    addSelectors() {
        const outbounds = this.getOutboundsList();
        const proxyList = this.getProxyList();

        // Compute valid custom-group NAMES up front so every group below can list
        // them as members. The group OBJECTS are emitted last (addCustomProxyGroups),
        // after all other groups exist, so their own refs can be validated.
        this.customProxyGroupNames = sanitizeCustomProxyGroups(
            this.customProxyGroups,
            this.getExistingGroupNames()
        ).map(g => g.name);

        this.addAutoSelectGroup(proxyList);
        this.addNodeSelectGroup(proxyList);
        if (this.groupByCountry) {
            this.addCountryGroups();
        }
        this.addOutboundGroups(outbounds, proxyList);
        this.addCustomRuleGroups(proxyList);
        this.addCustomRuleSetGroups(proxyList);
        this.addFallBackGroup(proxyList);
        this.addCustomProxyGroups(proxyList);

        // Merge user-defined proxy-groups (from a pasted base config) last.
        if (this.pendingUserProxyGroups && this.pendingUserProxyGroups.length > 0) {
            this.mergeUserProxyGroups(this.pendingUserProxyGroups);
        }
    }

    // Names of groups that already exist when custom-group names are computed.
    // Overridden per platform (Clash/Surge use proxy-groups[].name; sing-box uses
    // group outbounds[].tag). Default: empty — names only need to avoid built-ins,
    // which sanitizeCustomProxyGroups already handles via RESERVED_OUTBOUNDS.
    getExistingGroupNames() {
        return [];
    }
```

- [ ] **Step 4: Add the import**

At the top of `src/builders/BaseConfigBuilder.js`, the helper imports `RESERVED_OUTBOUNDS` from THIS file, so import the sanitizer here (no cycle: helper imports back only the already-evaluated `RESERVED_OUTBOUNDS` export). Add after the existing imports (after line 4):

```js
import { sanitizeCustomProxyGroups } from './helpers/customProxyGroups.js';
```

- [ ] **Step 5: Verify nothing broke**

Run: `npx vitest run test/clash-builder.test.js test/index.test.js`
Expected: PASS (child constructors still pass `customProxyGroups` as `[]` by default until Task 4-6; `getExistingGroupNames()` default returns `[]`).

- [ ] **Step 6: Commit**

```bash
git add src/builders/BaseConfigBuilder.js
git commit -m "feat(proxy-groups): base builder wiring + addSelectors ordering"
```

---

## Task 4: Endpoint wiring + Fall Back relax

**Files:**
- Modify: `src/app/createApp.jsx` — `/singbox` (71-129), `/clash` (131-182), `/surge` (184-230), `parseFallbackOutbound` (481-484).

This must come before the per-platform e2e tests so URLs carrying `customProxyGroups` reach the builders.

- [ ] **Step 1: Relax `parseFallbackOutbound`**

Replace lines 481-484:

```js
const VALID_FALLBACK_OUTBOUNDS = new Set(['Node Select', 'DIRECT', 'REJECT']);
function parseFallbackOutbound(raw, customProxyGroups = []) {
    if (VALID_FALLBACK_OUTBOUNDS.has(raw)) return raw;
    const customNames = new Set(
        (Array.isArray(customProxyGroups) ? customProxyGroups : [])
            .map(g => (g && typeof g.name === 'string') ? g.name.trim() : '')
            .filter(Boolean)
    );
    return customNames.has(raw) ? raw : 'Node Select';
}
```

- [ ] **Step 2: Wire `/clash`**

In the `/clash` handler, after the `customRuleSets` line (140) add a `customProxyGroups` parse, and move `fallbackOutbound` to use it. Replace lines 140-141:

```js
            const customRuleSets = parseJsonArray(c.req.query('customRuleSets'));
            const customProxyGroups = parseJsonArray(c.req.query('customProxyGroups'));
            const fallbackOutbound = parseFallbackOutbound(c.req.query('fallback_outbound'), customProxyGroups);
```

Then add `customProxyGroups` as the final constructor argument. Replace the `new ClashConfigBuilder(...)` tail (lines 168-171):

```js
                includeAutoSelect,
                customRuleSets,
                fallbackOutbound,
                customProxyGroups
            );
```

- [ ] **Step 3: Wire `/surge`**

Replace lines 193-194:

```js
            const customRuleSets = parseJsonArray(c.req.query('customRuleSets'));
            const customProxyGroups = parseJsonArray(c.req.query('customProxyGroups'));
            const fallbackOutbound = parseFallbackOutbound(c.req.query('fallback_outbound'), customProxyGroups);
```

Replace the `new SurgeConfigBuilder(...)` tail (lines 215-218):

```js
                groupByCountry,
                includeAutoSelect,
                customRuleSets,
                fallbackOutbound,
                customProxyGroups
            );
```

- [ ] **Step 4: Wire `/singbox`**

In the `/singbox` handler (71-129), locate the `customRuleSets` / `fallbackOutbound` parse lines and the `new SingboxConfigBuilder(...)` call. Add the parse right after `customRuleSets`:

```js
            const customProxyGroups = parseJsonArray(c.req.query('customProxyGroups'));
```
and change the `fallbackOutbound` line to:
```js
            const fallbackOutbound = parseFallbackOutbound(c.req.query('fallback_outbound'), customProxyGroups);
```
Then append `customProxyGroups` as the final argument to the `new SingboxConfigBuilder(...)` call (immediately after the existing final `fallbackOutbound` argument):
```js
                customRuleSets,
                fallbackOutbound,
                customProxyGroups
            );
```

- [ ] **Step 5: Verify existing endpoint tests pass**

Run: `npx vitest run test/restore-new-features.test.js test/fallback-outbound.test.js`
Expected: PASS — including "silently ignores invalid fallback_outbound" (EvilInjection is not a built-in and not a custom group name → `'Node Select'`).

- [ ] **Step 6: Commit**

```bash
git add src/app/createApp.jsx
git commit -m "feat(proxy-groups): parse customProxyGroups in endpoints, relax fallback validation"
```

---

## Task 5: ClashConfigBuilder.addCustomProxyGroups

**Files:**
- Modify: `src/builders/ClashConfigBuilder.js` — constructor (51-65), member-builder call sites, add `addCustomProxyGroups` + `getExistingGroupNames`.
- Test: `test/custom-proxy-groups-builders.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/custom-proxy-groups-builders.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';

const SAMPLE = [
    'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#HK-1',
    'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.5:8388#HK-2',
    'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.6:8388#US-1',
].join('\n');

function url(path, params) {
    const qs = new URLSearchParams();
    qs.append('lang', 'en');
    qs.append('config', SAMPLE);
    for (const [k, v] of Object.entries(params)) {
        qs.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    return `${path}?${qs}`;
}

describe('Clash custom proxy groups', () => {
    it('emits a url-test group whose members are the filter-matched nodes', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: [{ name: 'HK Auto', type: 'url-test', filter: 'HK' }],
        }));
        expect(res.status).toBe(200);
        const yaml = await res.text();
        // js-yaml emits keys in insertion order; the builder inserts { type, name, proxies, url, ... }.
        const m = yaml.match(/type: url-test\n\s+name: HK Auto\n\s+proxies:\n((?:\s+-\s+.+\n)+)/);
        expect(m).toBeTruthy();
        expect(m[1]).toContain('- HK-1');
        expect(m[1]).toContain('- HK-2');
        expect(m[1]).not.toContain('- US-1');
        expect(yaml).toContain('url: http://www.gstatic.com/generate_204');
    });

    it('keeps the native type for select/fallback/load-balance', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: [
                { name: 'LB', type: 'load-balance', filter: 'HK|US' },
                { name: 'FB', type: 'fallback', filter: 'HK' },
            ],
        }));
        const yaml = await res.text();
        expect(yaml).toMatch(/type: load-balance\n\s+name: LB/);
        expect(yaml).toMatch(/type: fallback\n\s+name: FB/);
    });

    it('adds the custom group to Node Select members', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: [{ name: 'HK Auto', type: 'url-test', filter: 'HK' }],
        }));
        const yaml = await res.text();
        // type is emitted before name; after `name:` the next key is `proxies:`.
        const ns = yaml.match(/name: 🚀 Node Select\n\s+proxies:\n((?:\s+-\s+.+\n)+)/);
        expect(ns).toBeTruthy();
        expect(ns[1]).toContain('- HK Auto');
    });

    it('drops an empty group (filter matches nothing, no refs)', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: [{ name: 'Ghost', type: 'url-test', filter: 'NOMATCH' }],
        }));
        const yaml = await res.text();
        expect(yaml).not.toContain('name: Ghost');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/custom-proxy-groups-builders.test.js -t "Clash"`
Expected: FAIL — no `HK Auto` group (base no-op + constructor doesn't receive the arg yet).

- [ ] **Step 3: Constructor receives the param**

In `src/builders/ClashConfigBuilder.js`, change the constructor signature (line 51) to add a trailing param and store it. Replace line 51:

```js
    constructor(inputString, selectedRules, customRules, baseConfig, lang, userAgent, groupByCountry = false, enableClashUI = false, externalController, externalUiDownloadUrl, includeAutoSelect = true, customRuleSets = [], fallbackOutbound = 'Node Select', customProxyGroups = []) {
```

After line 59 (`this.fallbackOutbound = ...`), add:

```js
        this.customProxyGroups = customProxyGroups || [];
```

- [ ] **Step 4: Thread `customProxyGroupNames` into member builders**

`addNodeSelectGroup` builds members via `buildNodeSelectMembers` (line 388). Add the param. Replace lines 388-395:

```js
        const list = buildNodeSelectMembers({
            proxyList,
            translator: this.t,
            groupByCountry: this.groupByCountry,
            manualGroupName: this.manualGroupName,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect: this.shouldIncludeAutoSelectGroup(proxyList),
            customProxyGroupNames: this.customProxyGroupNames
        });
```

`buildSelectGroupMembers` (line 412) feeds rule/ruleset/fallback groups. Replace lines 412-421:

```js
    buildSelectGroupMembers(proxyList = []) {
        return buildSelectorMembers({
            proxyList,
            translator: this.t,
            groupByCountry: this.groupByCountry,
            manualGroupName: this.manualGroupName,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect: this.shouldIncludeAutoSelectGroup(proxyList),
            customProxyGroupNames: this.customProxyGroupNames
        });
    }
```

`addCustomRuleGroups` builds via `buildCustomRuleMembers` (line 457). Replace lines 457-462:

```js
                    const proxies = buildCustomRuleMembers({
                        proxyList,
                        translator: this.t,
                        manualGroupName: this.manualGroupName,
                        includeAutoSelect: this.shouldIncludeAutoSelectGroup(proxyList),
                        customProxyGroupNames: this.customProxyGroupNames
                    });
```

- [ ] **Step 5: Add `getExistingGroupNames` + `addCustomProxyGroups`**

Add these two methods after `addCustomRuleSetGroups` (after line 494). Use the helper + the existing `resolveCustomRuleSetDefault`-style ref resolver:

```js
    getExistingGroupNames() {
        return (this.config['proxy-groups'] || []).map(g => g?.name).filter(Boolean);
    }

    addCustomProxyGroups(proxyList) {
        const groups = sanitizeCustomProxyGroups(this.customProxyGroups, this.getExistingGroupNames());
        if (groups.length === 0) return;

        // Valid resolved member names: real proxies + every emitted group name +
        // all custom group names (so groups may reference each other) + DIRECT/REJECT.
        const validRefSet = new Set([
            ...proxyList,
            ...this.getExistingGroupNames(),
            ...groups.map(g => g.name),
            'DIRECT', 'REJECT'
        ]);
        const resolveRef = (raw) => {
            if (raw === 'DIRECT' || raw === 'REJECT') return raw;
            return this.t('outboundNames.' + raw);
        };

        groups.forEach(g => {
            if (this.hasProxyGroup(g.name)) return;
            const { members, empty } = resolveCustomProxyGroupMembers(g, { proxyList, resolveRef, validRefSet });
            if (empty) return; // drop empty group; refs to it were filtered by validRefSet
            const nativeType = mapGroupType(g.type, 'clash');
            const group = { type: nativeType, name: g.name, proxies: members };
            if (isAutoType(nativeType)) {
                group.url = g.testUrl;
                group.interval = g.interval;
                group.lazy = false;
            }
            this.config['proxy-groups'].push(group);
        });
    }
```

- [ ] **Step 6: Add imports**

At the top of `src/builders/ClashConfigBuilder.js`, extend the helper import (line 6 currently imports from `./helpers/groupBuilder.js`) and add the new helper import below it:

```js
import { buildSelectorMembers, buildNodeSelectMembers, buildCustomRuleMembers, uniqueNames } from './helpers/groupBuilder.js';
import { sanitizeCustomProxyGroups, resolveCustomProxyGroupMembers, mapGroupType, isAutoType } from './helpers/customProxyGroups.js';
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run test/custom-proxy-groups-builders.test.js -t "Clash"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/builders/ClashConfigBuilder.js test/custom-proxy-groups-builders.test.js
git commit -m "feat(proxy-groups): emit custom proxy groups in Clash builder"
```

---

## Task 6: SingboxConfigBuilder.addCustomProxyGroups

**Files:**
- Modify: `src/builders/SingboxConfigBuilder.js` — constructor (10-28), member-builder call sites, add methods.
- Test: `test/custom-proxy-groups-builders.test.js` (append a Singbox block)

- [ ] **Step 1: Write the failing test**

Append to `test/custom-proxy-groups-builders.test.js`:

```js
describe('Singbox custom proxy groups', () => {
    it('emits a urltest group for url-test and degrades fallback/load-balance to urltest', async () => {
        const app = createApp();
        const res = await app.request(url('/singbox', {
            selectedRules: ['Non-China'],
            customProxyGroups: [
                { name: 'HK Auto', type: 'url-test', filter: 'HK' },
                { name: 'FB', type: 'fallback', filter: 'HK' },
                { name: 'LB', type: 'load-balance', filter: 'US' },
            ],
        }));
        expect(res.status).toBe(200);
        const json = JSON.parse(await res.text());
        const byTag = Object.fromEntries(json.outbounds.filter(o => o.tag).map(o => [o.tag, o]));
        expect(byTag['HK Auto'].type).toBe('urltest');
        expect(byTag['HK Auto'].outbounds).toEqual(expect.arrayContaining(['HK-1', 'HK-2']));
        expect(byTag['HK Auto'].outbounds).not.toContain('US-1');
        expect(byTag['FB'].type).toBe('urltest');
        expect(byTag['LB'].type).toBe('urltest');
    });

    it('select maps to selector and joins Node Select members', async () => {
        const app = createApp();
        const res = await app.request(url('/singbox', {
            selectedRules: ['Non-China'],
            customProxyGroups: [{ name: 'Pick', type: 'select', proxies: ['Node Select'] }],
        }));
        const json = JSON.parse(await res.text());
        const node = json.outbounds.find(o => o.tag === '🚀 Node Select');
        const pick = json.outbounds.find(o => o.tag === 'Pick');
        expect(pick.type).toBe('selector');
        expect(node.outbounds).toContain('Pick');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/custom-proxy-groups-builders.test.js -t "Singbox"`
Expected: FAIL — tags not present.

- [ ] **Step 3: Constructor receives the param**

In `src/builders/SingboxConfigBuilder.js`, change line 10 to add the trailing param:

```js
    constructor(inputString, selectedRules, customRules, baseConfig, lang, userAgent, groupByCountry = false, enableClashUI = false, externalController, externalUiDownloadUrl, singboxVersion = '1.12', includeAutoSelect = true, customRuleSets = [], fallbackOutbound = 'Node Select', customProxyGroups = []) {
```

After line 17 (`this.fallbackOutbound = ...`), add:

```js
        this.customProxyGroups = customProxyGroups || [];
```

- [ ] **Step 4: Thread `customProxyGroupNames` into member builders**

`addNodeSelectGroup` (line 185). Replace lines 185-193:

```js
        const members = buildNodeSelectMembers({
            proxyList,
            translator: this.t,
            groupByCountry: this.groupByCountry,
            manualGroupName: this.manualGroupName,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect,
            includeReject: false,
            customProxyGroupNames: this.customProxyGroupNames
        });
```

`buildSelectorMembers` (line 210). Replace lines 210-220:

```js
    buildSelectorMembers(proxyList = []) {
        return buildSelectorMemberList({
            proxyList,
            translator: this.t,
            groupByCountry: this.groupByCountry,
            manualGroupName: this.manualGroupName,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect: this.includeAutoSelect && this.hasAutoSelectCandidates(proxyList),
            includeReject: false,
            customProxyGroupNames: this.customProxyGroupNames
        });
    }
```

`addCustomRuleGroups` (line 251). Replace lines 251-257:

```js
                const selectorMembers = buildCustomRuleMembers({
                    proxyList,
                    translator: this.t,
                    manualGroupName: this.manualGroupName,
                    includeAutoSelect,
                    includeReject: false,
                    customProxyGroupNames: this.customProxyGroupNames
                });
```

- [ ] **Step 5: Add `getExistingGroupNames` + `addCustomProxyGroups`**

Add after `addCustomRuleSetGroups` (after line 286). sing-box group outbounds are `selector`/`urltest`; existing names = those tags:

```js
    getExistingGroupNames() {
        return (this.config.outbounds || [])
            .filter(o => o && (o.type === 'selector' || o.type === 'urltest') && o.tag)
            .map(o => o.tag);
    }

    addCustomProxyGroups(proxyList) {
        const groups = sanitizeCustomProxyGroups(this.customProxyGroups, this.getExistingGroupNames());
        if (groups.length === 0) return;

        const validRefSet = new Set([
            ...proxyList,
            ...this.getExistingGroupNames(),
            ...groups.map(g => g.name),
            'DIRECT', 'REJECT'
        ]);
        const resolveRef = (raw) => {
            if (raw === 'DIRECT' || raw === 'REJECT') return raw;
            return this.t('outboundNames.' + raw);
        };

        groups.forEach(g => {
            if (this.hasOutboundTag(g.name)) return;
            const { members, empty } = resolveCustomProxyGroupMembers(g, { proxyList, resolveRef, validRefSet });
            if (empty) return;
            const nativeType = mapGroupType(g.type, 'singbox'); // 'selector' | 'urltest'
            // Match the existing auto-select group: sing-box urltest uses engine
            // defaults for url/interval, so we omit them here too.
            this.config.outbounds.push({ type: nativeType, tag: g.name, outbounds: members });
        });
    }
```

- [ ] **Step 6: Add imports**

Extend line 6's import and add the helper import below (line 6 currently imports `buildSelectorMembers as buildSelectorMemberList, buildNodeSelectMembers, buildCustomRuleMembers, uniqueNames`):

```js
import { buildSelectorMembers as buildSelectorMemberList, buildNodeSelectMembers, buildCustomRuleMembers, uniqueNames } from './helpers/groupBuilder.js';
import { sanitizeCustomProxyGroups, resolveCustomProxyGroupMembers, mapGroupType } from './helpers/customProxyGroups.js';
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run test/custom-proxy-groups-builders.test.js -t "Singbox"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/builders/SingboxConfigBuilder.js test/custom-proxy-groups-builders.test.js
git commit -m "feat(proxy-groups): emit custom proxy groups in sing-box builder"
```

---

## Task 7: SurgeConfigBuilder.addCustomProxyGroups

**Files:**
- Modify: `src/builders/SurgeConfigBuilder.js` — constructor (9-19), member-builder call sites, add methods.
- Test: `test/custom-proxy-groups-builders.test.js` (append a Surge block)

- [ ] **Step 1: Write the failing test**

Append to `test/custom-proxy-groups-builders.test.js`:

```js
describe('Surge custom proxy groups', () => {
    it('emits a url-test line with matched nodes and url/interval; degrades load-balance to url-test', async () => {
        const app = createApp();
        const res = await app.request(url('/surge', {
            selectedRules: ['Non-China'],
            customProxyGroups: [
                { name: 'HK Auto', type: 'url-test', filter: 'HK' },
                { name: 'LB', type: 'load-balance', filter: 'US' },
            ],
        }));
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toMatch(/^HK Auto = url-test,.*HK-1.*HK-2.*url=http:\/\/www\.gstatic\.com\/generate_204, interval=300/m);
        expect(text).not.toMatch(/^HK Auto = url-test,.*US-1/m);
        expect(text).toMatch(/^LB = url-test,/m); // load-balance degraded
    });

    it('select line includes the group in Node Select options', async () => {
        const app = createApp();
        const res = await app.request(url('/surge', {
            selectedRules: ['Non-China'],
            customProxyGroups: [{ name: 'Pick', type: 'select', proxies: ['Node Select'] }],
        }));
        const text = await res.text();
        expect(text).toMatch(/^Pick = select,/m);
        expect(text).toMatch(/^🚀 Node Select = select,.*Pick/m);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/custom-proxy-groups-builders.test.js -t "Surge"`
Expected: FAIL.

- [ ] **Step 3: Constructor receives the param**

In `src/builders/SurgeConfigBuilder.js`, change line 9:

```js
    constructor(inputString, selectedRules, customRules, baseConfig, lang, userAgent, groupByCountry, includeAutoSelect = true, customRuleSets = [], fallbackOutbound = 'Node Select', customProxyGroups = []) {
```

After line 15 (`this.fallbackOutbound = ...`), add:

```js
        this.customProxyGroups = customProxyGroups || [];
```

- [ ] **Step 4: Thread `customProxyGroupNames` into member builders**

`buildNodeSelectOptions` (line 259). Replace lines 259-268:

```js
    buildNodeSelectOptions(proxyList = []) {
        return buildNodeSelectMembers({
            proxyList,
            translator: this.t,
            groupByCountry: false,
            manualGroupName: this.manualGroupName,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect: this.includeAutoSelect,
            customProxyGroupNames: this.customProxyGroupNames
        });
    }
```

`buildAggregatedOptions` (line 270). Replace lines 270-279:

```js
    buildAggregatedOptions(proxyList = []) {
        return buildSelectorMembers({
            proxyList,
            translator: this.t,
            groupByCountry: this.groupByCountry,
            manualGroupName: this.manualGroupName,
            countryGroupNames: this.countryGroupNames,
            includeAutoSelect: this.includeAutoSelect,
            customProxyGroupNames: this.customProxyGroupNames
        });
    }
```

`addCustomRuleGroups` (line 330). Replace lines 330-335:

```js
                const options = buildCustomRuleMembers({
                    proxyList,
                    translator: this.t,
                    manualGroupName: this.manualGroupName,
                    includeAutoSelect: this.includeAutoSelect,
                    customProxyGroupNames: this.customProxyGroupNames
                });
```

- [ ] **Step 5: Add `getExistingGroupNames` + `addCustomProxyGroups`**

Add after `addCustomRuleSetGroups` (after line 358). Surge proxy groups are objects/strings in `config['proxy-groups']`; reuse `getProxyName`-style name extraction via the existing `createProxyGroup`. Names come from the `name = ` prefix:

```js
    getExistingGroupNames() {
        return (this.config['proxy-groups'] || [])
            .map(line => (typeof line === 'string' ? line.split('=')[0].trim() : null))
            .filter(Boolean);
    }

    addCustomProxyGroups(proxyList) {
        const groups = sanitizeCustomProxyGroups(this.customProxyGroups, this.getExistingGroupNames());
        if (groups.length === 0) return;

        const validRefSet = new Set([
            ...proxyList,
            ...this.getExistingGroupNames(),
            ...groups.map(g => g.name),
            'DIRECT', 'REJECT'
        ]);
        const resolveRef = (raw) => {
            if (raw === 'DIRECT' || raw === 'REJECT') return raw;
            return this.t('outboundNames.' + raw);
        };

        groups.forEach(g => {
            if (this.hasProxyGroup(g.name)) return;
            const { members, empty } = resolveCustomProxyGroupMembers(g, { proxyList, resolveRef, validRefSet });
            if (empty) return;
            const nativeType = mapGroupType(g.type, 'surge'); // 'select'|'url-test'|'fallback'
            const extra = isAutoType(nativeType) ? `, url=${g.testUrl}, interval=${g.interval}` : '';
            this.config['proxy-groups'].push(this.createProxyGroup(g.name, nativeType, members, extra));
        });
    }
```

- [ ] **Step 6: Add imports**

Extend line 6's import and add the helper import below (line 6 currently imports `buildSelectorMembers, buildNodeSelectMembers, buildCustomRuleMembers, uniqueNames`):

```js
import { buildSelectorMembers, buildNodeSelectMembers, buildCustomRuleMembers, uniqueNames } from './helpers/groupBuilder.js';
import { sanitizeCustomProxyGroups, resolveCustomProxyGroupMembers, mapGroupType, isAutoType } from './helpers/customProxyGroups.js';
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run test/custom-proxy-groups-builders.test.js`
Expected: PASS (Clash + Singbox + Surge).

- [ ] **Step 8: Commit**

```bash
git add src/builders/SurgeConfigBuilder.js test/custom-proxy-groups-builders.test.js
git commit -m "feat(proxy-groups): emit custom proxy groups in Surge builder"
```

---

## Task 8: formLogic.js — serialize + restore

**Files:**
- Modify: `src/components/formLogic.js` — `getSubconverterUrl` (~257), `submitForm` (~439), `populateFormFromUrl` (~615), restore validation (~691), advanced-expand (~717), add `customProxyGroupNames()` accessor.
- Test: `test/custom-proxy-groups-restore.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/custom-proxy-groups-restore.test.js` (mirrors `surge-device-formlogic.test.js`):

```js
import { describe, it, expect } from 'vitest';
import { formLogicFn } from '../src/components/formLogic.js';

describe('formLogic — customProxyGroups round-trip', () => {
    const s = formLogicFn.toString();

    it('both URL builders read the hidden input and append the param', () => {
        const reads = s.match(/input\[name="customProxyGroups"\]/g) || [];
        const appends = s.match(/params\.append\(\s*['"]customProxyGroups['"]\s*,/g) || [];
        expect(reads.length).toBeGreaterThanOrEqual(2);
        expect(appends.length).toBeGreaterThanOrEqual(2);
    });

    it('populateFormFromUrl decodes the param and dispatches restore-custom-proxy-groups', () => {
        expect(s).toMatch(/params\.get\(\s*['"]customProxyGroups['"]\s*\)/);
        expect(s).toMatch(/['"]restore-custom-proxy-groups['"]/);
    });

    it('restores customProxyGroups BEFORE customRuleSets and customRules', () => {
        const cpg = s.indexOf("'restore-custom-proxy-groups'");
        const crs = s.indexOf("'restore-custom-rule-sets'");
        const cr = s.indexOf("'restore-custom-rules'");
        expect(cpg).toBeGreaterThan(-1);
        expect(cpg).toBeLessThan(crs);
        expect(cpg).toBeLessThan(cr);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/custom-proxy-groups-restore.test.js`
Expected: FAIL — patterns not present.

- [ ] **Step 3: `getSubconverterUrl` — append param**

In `src/components/formLogic.js`, after the `customRuleSets` block in `getSubconverterUrl` (after line 264), add:

```js
                // Include customProxyGroups when available
                try {
                    const customProxyGroupsInput = document.querySelector('input[name="customProxyGroups"]');
                    const customProxyGroups = customProxyGroupsInput && customProxyGroupsInput.value ? JSON.parse(customProxyGroupsInput.value) : [];
                    if (Array.isArray(customProxyGroups) && customProxyGroups.length > 0) {
                        params.append('customProxyGroups', JSON.stringify(customProxyGroups));
                    }
                } catch { }
```

- [ ] **Step 4: `submitForm` — append param**

In `submitForm`, after the `customRuleSets` read/append (around lines 439-454), add the analogous read + conditional append. After the line that appends `customRuleSets` in `submitForm`, insert:

```js
                    const customProxyGroupsInput = document.querySelector('input[name="customProxyGroups"]');
                    const customProxyGroups = customProxyGroupsInput && customProxyGroupsInput.value ? JSON.parse(customProxyGroupsInput.value) : [];
                    if (Array.isArray(customProxyGroups) && customProxyGroups.length > 0) {
                        params.append('customProxyGroups', JSON.stringify(customProxyGroups));
                    }
```

- [ ] **Step 5: `populateFormFromUrl` — restore dispatch (before customRuleSets)**

In `populateFormFromUrl`, insert this block AFTER the `surgeDevices` block (after line 653) and BEFORE the `customRuleSets` block (line 655):

```js
                // Extract customProxyGroups before rule sets/rules so their outbound
                // dropdowns can list the custom group names during validateOutbounds().
                const customProxyGroups = params.get('customProxyGroups');
                if (customProxyGroups) {
                    try {
                        const parsed = JSON.parse(customProxyGroups);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            window.dispatchEvent(new CustomEvent('restore-custom-proxy-groups', {
                                detail: { groups: parsed }
                            }));
                        }
                    } catch (e) {
                        console.warn('Failed to parse customProxyGroups:', e);
                    }
                }
```

- [ ] **Step 6: Relax fallback restore + advanced-expand**

Replace the fallback restore guard (lines 690-693):

```js
                const fbo = params.get('fallback_outbound');
                if (fbo) {
                    // Accept built-ins and custom proxy group names; the server
                    // re-validates and falls back to Node Select for unknown targets.
                    this.fallbackOutbound = fbo;
                }
```

Replace the advanced-expand condition (lines 717-719) to include `customProxyGroups`:

```js
                if (selectedRules || customRules || customRuleSets || customProxyGroups || this.groupByCountry || this.enableClashUI ||
                    externalController || externalUiDownloadUrl || ua || configId) {
                    this.showAdvanced = true;
                }
```

- [ ] **Step 7: Add `customProxyGroupNames()` accessor (for the Fall Back dropdown in Form.jsx)**

Add a method to the object returned by `formLogicFn` (place it near other helper methods, e.g. right before `getSubconverterUrl` at line 237):

```js
            customProxyGroupNames() {
                try {
                    const el = document.querySelector('input[name="customProxyGroups"]');
                    if (!el || !el.value) return [];
                    const parsed = JSON.parse(el.value);
                    if (!Array.isArray(parsed)) return [];
                    return Array.from(new Set(parsed.map(g => g && g.name).filter(Boolean)));
                } catch { return []; }
            },
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run test/custom-proxy-groups-restore.test.js`
Expected: PASS. Also run `npx vitest run test/surge-device-formlogic.test.js` — Expected: PASS (unchanged).

- [ ] **Step 9: Commit**

```bash
git add src/components/formLogic.js test/custom-proxy-groups-restore.test.js
git commit -m "feat(proxy-groups): serialize and restore customProxyGroups in formLogic"
```

---

## Task 9: New form component `CustomProxyGroups.jsx`

**Files:**
- Create: `src/components/CustomProxyGroups.jsx`

This mirrors `CustomRuleSets.jsx` structure (form/JSON modes, `__uid` hidden-input stripping, restore listener) with fields: name, type, filter, excludeFilter, members (multi-select), testUrl, interval.

- [ ] **Step 1: Create the component**

Create `src/components/CustomProxyGroups.jsx`:

```jsx
/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import { UNIFIED_RULES } from '../config/rules.js';

export const CustomProxyGroups = (props) => {
    const { t } = props;
    const outboundLabels = {};
    UNIFIED_RULES.forEach((r) => { outboundLabels[r.name] = t('outboundNames.' + r.name); });

    return (
        <div x-data="customProxyGroupsData()" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <i class="fas fa-layer-group text-gray-400"></i>
                    {t('customProxyGroupsSection')}
                </h3>
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
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('customProxyGroupsSectionTooltip')}</p>

            {/* Form mode */}
            <div x-show="mode === 'form'">
                <template x-if="groups.length === 0">
                    <div class="text-center py-12 bg-gray-50 dark:bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <div class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                            <i class="fas fa-plus text-2xl"></i>
                        </div>
                        <p class="text-gray-500 dark:text-gray-400 mb-4">{t('noCustomProxyGroupsForm')}</p>
                        <button type="button" x-on:click="addGroup()" class="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200 font-medium">
                            {t('addCustomProxyGroup')}
                        </button>
                    </div>
                </template>

                <div class="space-y-4">
                    <template x-for="(group, index) in groups" x-bind:key="group.__uid || index">
                        <div class="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="font-medium text-gray-900 dark:text-white" x-text="'#' + (index + 1) + ' ' + (group.name || '(unnamed)')"></h3>
                                <button type="button" x-on:click="removeGroup(index)" class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('proxyGroupName')}</label>
                                    <input type="text" x-model="group.name" placeholder="🇭🇰 HK Auto" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('proxyGroupType')}</label>
                                    <select x-model="group.type" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                        <option value="select">select</option>
                                        <option value="url-test">url-test</option>
                                        <option value="fallback">fallback</option>
                                        <option value="load-balance">load-balance</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('proxyGroupFilter')}</label>
                                    <input type="text" x-model="group.filter" placeholder="香港|HK|🇭🇰" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('proxyGroupFilterHint')}</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('proxyGroupExcludeFilter')}</label>
                                    <input type="text" x-model="group.excludeFilter" placeholder="官网|剩余|过期" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                </div>
                                <div class="col-span-1 md:col-span-2">
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('proxyGroupMembers')}</label>
                                    <select multiple x-model="group.proxies" size="5" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                        <optgroup label={t('outboundBuiltIn')}>
                                            <option value="Node Select">{t('outboundNames.Node Select')}</option>
                                            <option value="Auto Select">{t('outboundNames.Auto Select')}</option>
                                            <option value="Fall Back">{t('outboundNames.Fall Back')}</option>
                                            <option value="DIRECT">DIRECT</option>
                                            <option value="REJECT">REJECT</option>
                                        </optgroup>
                                        <optgroup label={t('outboundSelectedRules')} x-show="(selectedRuleNames() || []).length > 0">
                                            <template x-for="key in selectedRuleNames()" x-bind:key="key">
                                                <option x-bind:value="key" x-text="CPG_OUTBOUND_LABELS[key] || key"></option>
                                            </template>
                                        </optgroup>
                                        <optgroup label={t('customRuleSetsSection')} x-show="customRuleSetNames().length > 0">
                                            <template x-for="n in customRuleSetNames()" x-bind:key="n">
                                                <option x-bind:value="n" x-text="n"></option>
                                            </template>
                                        </optgroup>
                                        <optgroup label={t('customProxyGroupsSection')} x-show="otherGroupNames(index).length > 0">
                                            <template x-for="n in otherGroupNames(index)" x-bind:key="n">
                                                <option x-bind:value="n" x-text="n"></option>
                                            </template>
                                        </optgroup>
                                    </select>
                                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('proxyGroupMembersHint')}</p>
                                </div>
                                <template x-if="group.type === 'url-test' || group.type === 'fallback'">
                                    <div class="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('proxyGroupTestUrl')}</label>
                                            <input type="url" x-model="group.testUrl" placeholder="http://www.gstatic.com/generate_204" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('proxyGroupInterval')}</label>
                                            <input type="number" x-model.number="group.interval" placeholder="300" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                        </div>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </template>
                </div>

                <div class="mt-6 flex flex-wrap gap-3">
                    <button type="button" x-on:click="addGroup()" class="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors font-medium flex items-center gap-2">
                        <i class="fas fa-plus"></i>
                        {t('addCustomProxyGroup')}
                    </button>
                    <button type="button" x-on:click="clearAll()" x-show="groups.length > 0" class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium flex items-center gap-2">
                        <i class="fas fa-trash"></i>
                        {t('clearAll')}
                    </button>
                </div>
            </div>

            {/* JSON mode */}
            <div x-show="mode === 'json'">
                <textarea x-model="jsonContent" rows={12} class="w-full px-4 py-2 font-mono text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder='[{"name":"🇭🇰 HK Auto","type":"url-test","filter":"香港|HK","proxies":[]}]'></textarea>
                <p x-show="jsonError" class="mt-2 text-sm text-red-600 dark:text-red-400" x-text="jsonError"></p>
            </div>

            <input type="hidden" name="customProxyGroups" x-bind:value="JSON.stringify(groups, (k, v) => k === '__uid' ? undefined : v)" />

            <script dangerouslySetInnerHTML={{
                __html: `
                const CPG_OUTBOUND_LABELS = ${JSON.stringify(outboundLabels)};

                const cpgUid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'pg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);

                function cpgReadSelectedRules() {
                    const boxes = document.querySelectorAll('input[type="checkbox"][x-model="selectedRules"]');
                    const out = [];
                    boxes.forEach(b => { if (b.checked) out.push(b.value); });
                    return out;
                }

                function cpgReadCustomRuleSets() {
                    const el = document.querySelector('input[name="customRuleSets"]');
                    if (!el || !el.value) return [];
                    try { const p = JSON.parse(el.value); return Array.isArray(p) ? p : []; } catch { return []; }
                }

                function customProxyGroupsData() {
                    return {
                        mode: 'form',
                        groups: [],
                        jsonContent: '[]',
                        jsonError: null,
                        selectedRuleNames() { return cpgReadSelectedRules(); },
                        customRuleSetNames() {
                            return Array.from(new Set(cpgReadCustomRuleSets().map(r => r && r.name).filter(Boolean)));
                        },
                        otherGroupNames(currentIdx) {
                            const out = [];
                            this.groups.forEach((g, i) => {
                                if (i !== currentIdx && g && g.name) out.push(g.name);
                            });
                            return Array.from(new Set(out));
                        },
                        init() {
                            this.$watch('groups', (v) => {
                                if (this.mode === 'form') this.jsonContent = JSON.stringify(v, (k, val) => k === '__uid' ? undefined : val, 2);
                                window.dispatchEvent(new Event('custom-proxy-groups-changed'));
                            });
                            this.$watch('jsonContent', (v) => {
                                if (this.mode === 'json') {
                                    try {
                                        const parsed = JSON.parse(v);
                                        if (Array.isArray(parsed)) {
                                            this.groups = parsed.map(g => ({ __uid: g.__uid || cpgUid(), ...g }));
                                            this.jsonError = null;
                                        } else this.jsonError = 'must be array';
                                    } catch (e) { this.jsonError = e.message; }
                                }
                            });
                            window.addEventListener('restore-custom-proxy-groups', (event) => {
                                if (event.detail && Array.isArray(event.detail.groups)) {
                                    this.groups = event.detail.groups.map(g => ({ __uid: g.__uid || cpgUid(), ...g }));
                                    this.jsonContent = JSON.stringify(this.groups, (k, v) => k === '__uid' ? undefined : v, 2);
                                    this.mode = 'json';
                                }
                            });
                        },
                        addGroup() {
                            this.groups.push({
                                __uid: cpgUid(),
                                name: '', type: 'select', filter: '', excludeFilter: '',
                                proxies: [], testUrl: 'http://www.gstatic.com/generate_204', interval: 300
                            });
                        },
                        removeGroup(i) { this.groups.splice(i, 1); },
                        clearAll() {
                            if (!confirm('${t('confirmClearAllRules')}')) return;
                            this.groups = [];
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

- [ ] **Step 2: Verify it compiles (build)**

Run: `npm run build` (runs `node scripts/build-vercel.mjs`).
Expected: build succeeds; no JSX/syntax errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CustomProxyGroups.jsx
git commit -m "feat(proxy-groups): add CustomProxyGroups form component"
```

---

## Task 10: Wire the component + dropdowns

**Files:**
- Modify: `src/components/Form.jsx` (import, render, Fall Back optgroup), `src/components/CustomRules.jsx` (outbound optgroup + sibling-read), `src/components/CustomRuleSets.jsx` (outbound optgroup + sibling-read).

- [ ] **Step 1: Form.jsx — import + render**

Add the import after line 5 (`import { CustomRuleSets } ...`):

```jsx
import { CustomProxyGroups } from './CustomProxyGroups.jsx';
```

Render it after `<CustomRuleSets t={t} />` (line 234):

```jsx
  <CustomRuleSets t={t} />

  <CustomProxyGroups t={t} />
```

- [ ] **Step 2: Form.jsx — Fall Back dropdown optgroup**

The Fall Back `<select x-model="fallbackOutbound">` (lines 266-270) currently lists Node Select / DIRECT / REJECT. Wrap those in a built-in optgroup and add a custom-groups optgroup. Replace lines 266-270 with:

```jsx
                  <select x-model="fallbackOutbound" class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                    <optgroup label={t('outboundBuiltIn')}>
                      <option value="Node Select">{t('outboundNames.Node Select')}</option>
                      <option value="DIRECT">DIRECT</option>
                      <option value="REJECT">REJECT</option>
                    </optgroup>
                    <optgroup label={t('customProxyGroupsSection')} x-show="customProxyGroupNames().length > 0">
                      <template x-for="n in customProxyGroupNames()" x-bind:key="n">
                        <option x-bind:value="n" x-text="n"></option>
                      </template>
                    </optgroup>
                  </select>
```

(`customProxyGroupNames()` is the accessor added to `formLogicFn` in Task 8 Step 7; Form.jsx's root scope is the `formLogicFn` data object.)

- [ ] **Step 3: CustomRules.jsx — sibling-read + optgroup**

`CustomRules.jsx` has a `<script>` defining `customRulesData()` (search for `function customRulesData`). Add, alongside the existing sibling-read helpers, a reader + accessor + version, and an event listener inside `init()`. Add these top-level helper + inside the data object:

Add a top-level helper function near the other `readSibling...` helpers in the CustomRules script:

```js
                function crReadCustomProxyGroups() {
                    const el = document.querySelector('input[name="customProxyGroups"]');
                    if (!el || !el.value) return [];
                    try { const p = JSON.parse(el.value); return Array.isArray(p) ? p : []; } catch { return []; }
                }
```

In the `customRulesData()` returned object, add a version field and accessor (place near `surgeDeviceNames`):

```js
                        customProxyGroupsVersion: 0,
                        customProxyGroupNames() {
                            void this.customProxyGroupsVersion;
                            return Array.from(new Set(crReadCustomProxyGroups().map(g => g && g.name).filter(Boolean)));
                        },
```

In `init()`, add a listener (near the `surge-devices-changed` listener):

```js
                            window.addEventListener('custom-proxy-groups-changed', () => {
                                this.customProxyGroupsVersion++;
                                if (typeof this.validateOutbounds === 'function') this.validateOutbounds();
                            });
```

Add the optgroup to the outbound `<select x-model="rule.name">` (after the Surge Devices optgroup, around line 122):

```jsx
                    <optgroup label={t('customProxyGroupsSection')} x-show="customProxyGroupNames().length > 0">
                        <template x-for="n in customProxyGroupNames()" x-bind:key="n">
                            <option x-bind:value="n" x-text="n"></option>
                        </template>
                    </optgroup>
```

If `customRulesData()` has an `isValidOutbound(value)` (it validates outbound names), add custom group names as valid. Find `isValidOutbound` and add, before its final `return false;`:

```js
                            if (this.customProxyGroupNames().includes(value)) return true;
```

- [ ] **Step 4: CustomRuleSets.jsx — sibling-read + optgroup**

Apply the SAME additions to `CustomRuleSets.jsx`'s `customRuleSetsData()` script (identical code):

Top-level helper near `readSiblingSurgeDevicesForRuleSets`:

```js
                function crsReadCustomProxyGroups() {
                    const el = document.querySelector('input[name="customProxyGroups"]');
                    if (!el || !el.value) return [];
                    try { const p = JSON.parse(el.value); return Array.isArray(p) ? p : []; } catch { return []; }
                }
```

In the data object (near `surgeDeviceNames`, lines 247-251):

```js
                        customProxyGroupsVersion: 0,
                        customProxyGroupNames() {
                            void this.customProxyGroupsVersion;
                            return Array.from(new Set(crsReadCustomProxyGroups().map(g => g && g.name).filter(Boolean)));
                        },
```

In `init()` (near line 296's `surge-devices-changed` listener):

```js
                            window.addEventListener('custom-proxy-groups-changed', () => {
                                this.customProxyGroupsVersion++;
                                this.validateOutbounds();
                            });
```

In `isValidOutbound` (lines 252-265), before `return false;`:

```js
                            if (this.customProxyGroupNames().includes(value)) return true;
```

Add the optgroup after the Surge Devices optgroup (after line 163):

```jsx
                                        <optgroup label={t('customProxyGroupsSection')} x-show="customProxyGroupNames().length > 0">
                                            <template x-for="n in customProxyGroupNames()" x-bind:key="n">
                                                <option x-bind:value="n" x-text="n"></option>
                                            </template>
                                        </optgroup>
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/Form.jsx src/components/CustomRules.jsx src/components/CustomRuleSets.jsx
git commit -m "feat(proxy-groups): wire custom proxy groups into form + outbound dropdowns"
```

---

## Task 11: i18n strings

**Files:**
- Modify: `src/i18n/index.js`

- [ ] **Step 1: Add keys to every language block**

The file has one translation object per language (search for `customRuleSetsSection:` — there is one occurrence per language: zh-CN, en-US, fa-IR, ru-RU, and any others present). In EACH language object, add these keys next to the existing `customRuleSetsSection` key. Use the zh-CN values in the zh-CN block, the en-US values in the en-US block, and the **en-US values** in every other language block (acceptable English fallback; translate later if desired).

zh-CN block values:

```js
    customProxyGroupsSection: '自定义策略组',
    customProxyGroupsSectionTooltip: '自定义命名策略组：按节点名筛选并/或引用其它组，作为可被规则引用的出站目标',
    noCustomProxyGroupsForm: '暂无自定义策略组',
    addCustomProxyGroup: '添加自定义策略组',
    proxyGroupName: '策略组名称',
    proxyGroupType: '类型',
    proxyGroupFilter: '节点名筛选（正则）',
    proxyGroupFilterHint: '匹配节点名的正则，例如 香港|HK|🇭🇰；留空则只用下方引用的组',
    proxyGroupExcludeFilter: '排除筛选（正则，可选）',
    proxyGroupMembers: '附加成员（其它组）',
    proxyGroupMembersHint: '按住 Ctrl/⌘ 多选；这些会和筛选命中的节点合并',
    proxyGroupTestUrl: '测试 URL',
    proxyGroupInterval: '测试间隔（秒）',
```

en-US block values (also used as the fallback in other language blocks):

```js
    customProxyGroupsSection: 'Custom Proxy Groups',
    customProxyGroupsSectionTooltip: 'Define named proxy groups by node-name filter and/or references to other groups; usable as a routing target',
    noCustomProxyGroupsForm: 'No custom proxy groups yet',
    addCustomProxyGroup: 'Add custom proxy group',
    proxyGroupName: 'Group name',
    proxyGroupType: 'Type',
    proxyGroupFilter: 'Node-name filter (regex)',
    proxyGroupFilterHint: 'Regex matched against node names, e.g. HK|🇭🇰|Hong; leave empty to use only the referenced groups below',
    proxyGroupExcludeFilter: 'Exclude filter (regex, optional)',
    proxyGroupMembers: 'Extra members (other groups)',
    proxyGroupMembersHint: 'Ctrl/⌘-click to multi-select; merged with the filter-matched nodes',
    proxyGroupTestUrl: 'Test URL',
    proxyGroupInterval: 'Test interval (s)',
```

- [ ] **Step 2: Verify build + no missing-key fallthrough**

Run: `npm run build`
Expected: succeeds. Spot-check that `grep -c "customProxyGroupsSection:" src/i18n/index.js` equals the number of language blocks (same count as `grep -c "customRuleSetsSection:" src/i18n/index.js`).

- [ ] **Step 3: Commit**

```bash
git add src/i18n/index.js
git commit -m "feat(proxy-groups): add i18n strings for custom proxy groups"
```

---

## Task 12: Full round-trip e2e + suite + build

**Files:**
- Create: `test/custom-proxy-groups-e2e.test.js`

- [ ] **Step 1: Write the e2e test**

Create `test/custom-proxy-groups-e2e.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';

const SAMPLE = [
    'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#HK-1',
    'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.6:8388#US-1',
].join('\n');

function url(path, params) {
    const qs = new URLSearchParams();
    qs.append('lang', 'en');
    qs.append('config', SAMPLE);
    for (const [k, v] of Object.entries(params)) {
        qs.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    return `${path}?${qs}`;
}

describe('custom proxy groups — full integration', () => {
    const groups = [{ name: 'HK Auto', type: 'url-test', filter: 'HK' }];

    it('a custom group can be a custom-rule outbound target (Clash)', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: groups,
            customRules: [{ name: 'HK Auto', domain: 'example.com' }],
        }));
        const yaml = await res.text();
        expect(yaml).toContain('DOMAIN,example.com,HK Auto');
        expect(yaml).toContain('name: HK Auto');
    });

    it('a custom group can be the Fall Back target (Clash)', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: groups,
            fallback_outbound: 'HK Auto',
        }));
        const yaml = await res.text();
        const m = yaml.match(/name: 🐟 Fall Back[\s\S]*?proxies:\n((?:\s+-\s+.+\n)+)/);
        expect(m).toBeTruthy();
        expect(m[1].split('\n')[0].trim()).toBe('- HK Auto');
    });

    it('unknown fallback_outbound still defaults to Node Select and is never emitted', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: groups,
            fallback_outbound: 'EvilInjection',
        }));
        const yaml = await res.text();
        expect(yaml).not.toContain('EvilInjection');
    });

    it('works across all three formats without error', async () => {
        const app = createApp();
        for (const path of ['/clash', '/singbox', '/surge']) {
            const res = await app.request(url(path, { selectedRules: ['Non-China'], customProxyGroups: groups }));
            expect(res.status).toBe(200);
            expect(await res.text()).toContain('HK Auto');
        }
    });
});
```

- [ ] **Step 2: Run the e2e test**

Run: `npx vitest run test/custom-proxy-groups-e2e.test.js`
Expected: PASS.

- [ ] **Step 3: Run the FULL suite + build**

Run: `npx vitest run` then `npm run build`
Expected: all tests PASS, build succeeds. If any pre-existing test regressed, fix the regression before continuing.

- [ ] **Step 4: Commit**

```bash
git add test/custom-proxy-groups-e2e.test.js
git commit -m "test(proxy-groups): full round-trip integration for custom proxy groups"
```

---

## Final verification checklist

- [ ] `npx vitest run` — entire suite green.
- [ ] `npm run build` — succeeds.
- [ ] Manual smoke (optional, via `/run` skill or `npm run dev`): open the form, add a custom group "🇭🇰 HK Auto" (url-test, filter `HK`), confirm it appears in Node Select and in the Custom Rules / Fall Back dropdowns; generate Clash/sing-box/Surge and verify the group is present with the right members; shorten + "Load from Code" and confirm the group restores.
- [ ] Update `README.md` / `README.zh-Hans.md` changelog + the "Differences from upstream" list with a new version entry describing custom proxy groups (follow the existing changelog style; do this as a final docs commit).
```
