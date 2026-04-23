# Rule Groups Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 15 new built-in rule groups (collapsed UI), a provider dictionary with custom RuleSet support, and extend share-link round-trip to cover the new `customRuleSets` field — without breaking any existing preset or share URL.

**Architecture:**
- New `RULE_SET_PROVIDERS` dict (metacubex/blackmatrix7/loyalsoldier/acl4ssr/custom) maps a `(provider, type, format)` triple to a URL template.
- `UNIFIED_RULES` grows by 15 items marked `extended: true`; `PREDEFINED_RULE_SETS.comprehensive` is redefined to filter them out → zero preset drift.
- `customRuleSets` travels separately from `customRules` end-to-end: own URL param, own UI card, own generator helpers, own outbound group.
- Three builders (Singbox/Clash/Surge) accept `customRuleSets` and emit rule-set entries via a shared `resolveCustomRuleSetUrl(item, format)` helper.

**Tech Stack:** Hono, Alpine.js, Vitest (with `@cloudflare/vitest-pool-workers`), Cloudflare Workers.

**Spec:** [docs/superpowers/specs/2026-04-23-rule-groups-expansion-design.md](../specs/2026-04-23-rule-groups-expansion-design.md)

---

## Task 1: Provider dictionary

**Files:**
- Create: `src/config/ruleSetProviders.js`
- Test: `test/rule-set-providers.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/rule-set-providers.test.js
import { describe, it, expect } from 'vitest';
import { RULE_SET_PROVIDERS, resolveProviderUrl } from '../src/config/ruleSetProviders.js';

describe('RULE_SET_PROVIDERS', () => {
  it('has the five expected providers (excluding custom)', () => {
    expect(Object.keys(RULE_SET_PROVIDERS).sort()).toEqual(
      ['acl4ssr', 'blackmatrix7', 'loyalsoldier', 'metacubex'].sort()
    );
  });

  it('resolves metacubex site sing-box URL', () => {
    const url = resolveProviderUrl('metacubex', 'site', 'singbox', 'reddit');
    expect(url).toBe('https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/sing/geo/geosite/reddit.srs');
  });

  it('resolves metacubex ip clash URL', () => {
    const url = resolveProviderUrl('metacubex', 'ip', 'clash', 'google');
    expect(url).toBe('https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geoip/google.mrs');
  });

  it('resolves blackmatrix7 site sing-box URL with subdirectory pattern', () => {
    const url = resolveProviderUrl('blackmatrix7', 'site', 'singbox', 'Reddit');
    expect(url).toBe('https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/sing-box/Reddit/Reddit.srs');
  });

  it('returns null for acl4ssr+singbox (format gate)', () => {
    expect(resolveProviderUrl('acl4ssr', 'site', 'singbox', 'anything')).toBeNull();
  });

  it('returns null for unknown provider', () => {
    expect(resolveProviderUrl('unknown', 'site', 'singbox', 'x')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/rule-set-providers.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Create the provider dictionary**

```js
// src/config/ruleSetProviders.js
/**
 * Rule-Set Provider Dictionary
 *
 * Maps (provider, type, format) -> URL template. Each entry describes
 * how to build a full URL given a filename stem.
 *
 *   type:   'site' | 'ip'
 *   format: 'singbox' | 'clash' | 'surge'
 *
 * filePattern uses {file} as a placeholder. Providers where a given
 * format is absent (e.g. acl4ssr + singbox) are intentionally omitted
 * and resolve to null (skip + warn in the builder).
 */

export const RULE_SET_PROVIDERS = {
  metacubex: {
    label: 'MetaCubeX',
    formats: {
      singbox: {
        site: { base: 'https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/sing/geo/geosite/', ext: '.srs', filePattern: '{file}' },
        ip:   { base: 'https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/sing/geo/geoip/',   ext: '.srs', filePattern: '{file}' }
      },
      clash: {
        site: { base: 'https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/', ext: '.mrs', filePattern: '{file}' },
        ip:   { base: 'https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geoip/',   ext: '.mrs', filePattern: '{file}' }
      },
      surge: {
        site: { base: 'https://gh-proxy.com/https://github.com/NSZA156/surge-geox-rules/raw/refs/heads/release/geo/geosite/', ext: '.conf', filePattern: '{file}' },
        ip:   { base: 'https://gh-proxy.com/https://github.com/NSZA156/surge-geox-rules/raw/refs/heads/release/geo/geoip/',   ext: '.txt',  filePattern: '{file}' }
      }
    }
  },
  blackmatrix7: {
    label: 'blackmatrix7',
    formats: {
      singbox: {
        site: { base: 'https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/sing-box/', ext: '.srs', filePattern: '{file}/{file}' },
        ip:   { base: 'https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/sing-box/', ext: '.srs', filePattern: '{file}/{file}' }
      },
      clash: {
        site: { base: 'https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/Clash/', ext: '.yaml', filePattern: '{file}/{file}' },
        ip:   { base: 'https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/Clash/', ext: '.yaml', filePattern: '{file}/{file}' }
      },
      surge: {
        site: { base: 'https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/Surge/', ext: '.list', filePattern: '{file}/{file}' },
        ip:   { base: 'https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/Surge/', ext: '.list', filePattern: '{file}/{file}' }
      }
    }
  },
  loyalsoldier: {
    label: 'Loyalsoldier',
    formats: {
      singbox: {
        site: { base: 'https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/sing/geo-lite/geosite/', ext: '.srs', filePattern: '{file}' },
        ip:   { base: 'https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/sing/geo-lite/geoip/',   ext: '.srs', filePattern: '{file}' }
      },
      clash: {
        site: { base: 'https://gh-proxy.com/https://github.com/Loyalsoldier/clash-rules/raw/refs/heads/release/', ext: '.yaml', filePattern: '{file}' },
        ip:   { base: 'https://gh-proxy.com/https://github.com/Loyalsoldier/clash-rules/raw/refs/heads/release/', ext: '.yaml', filePattern: '{file}' }
      }
      // surge intentionally omitted -> format-gated
    }
  },
  acl4ssr: {
    label: 'ACL4SSR',
    formats: {
      clash: {
        site: { base: 'https://gh-proxy.com/https://github.com/ACL4SSR/ACL4SSR/raw/refs/heads/master/Clash/Providers/', ext: '.yaml', filePattern: '{file}' },
        ip:   { base: 'https://gh-proxy.com/https://github.com/ACL4SSR/ACL4SSR/raw/refs/heads/master/Clash/Providers/', ext: '.yaml', filePattern: '{file}' }
      },
      surge: {
        site: { base: 'https://gh-proxy.com/https://github.com/ACL4SSR/ACL4SSR/raw/refs/heads/master/Surge/', ext: '.list', filePattern: '{file}' },
        ip:   { base: 'https://gh-proxy.com/https://github.com/ACL4SSR/ACL4SSR/raw/refs/heads/master/Surge/', ext: '.list', filePattern: '{file}' }
      }
      // singbox intentionally omitted -> format-gated
    }
  }
};

export function resolveProviderUrl(providerId, type, format, file) {
  const provider = RULE_SET_PROVIDERS[providerId];
  if (!provider) return null;
  const spec = provider.formats?.[format]?.[type];
  if (!spec) return null;
  const stem = spec.filePattern.replace(/\{file\}/g, file);
  return `${spec.base}${stem}${spec.ext}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/rule-set-providers.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config/ruleSetProviders.js test/rule-set-providers.test.js
git commit -m "feat: add RULE_SET_PROVIDERS dictionary with URL resolver"
```

---

## Task 2: Extended groups in UNIFIED_RULES

**Files:**
- Modify: `src/config/rules.js:8-108`
- Test: `test/extended-rules.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/extended-rules.test.js
import { describe, it, expect } from 'vitest';
import { UNIFIED_RULES, PREDEFINED_RULE_SETS } from '../src/config/rules.js';

describe('Extended rule groups', () => {
  it('adds 15 extended groups to UNIFIED_RULES', () => {
    const extended = UNIFIED_RULES.filter(r => r.extended === true);
    expect(extended.length).toBe(15);
  });

  it('extended groups include Discord, Spotify, Reddit, OpenAI', () => {
    const names = UNIFIED_RULES.filter(r => r.extended).map(r => r.name);
    expect(names).toEqual(expect.arrayContaining(['Discord', 'Spotify', 'Reddit', 'OpenAI', 'Anthropic']));
  });

  it('comprehensive preset excludes extended groups (backward compat)', () => {
    expect(PREDEFINED_RULE_SETS.comprehensive.length).toBe(18);
    const extendedNames = UNIFIED_RULES.filter(r => r.extended).map(r => r.name);
    for (const name of extendedNames) {
      expect(PREDEFINED_RULE_SETS.comprehensive).not.toContain(name);
    }
  });

  it('balanced and minimal presets are unchanged', () => {
    expect(PREDEFINED_RULE_SETS.minimal).toEqual(['Location:CN', 'Private', 'Non-China']);
    expect(PREDEFINED_RULE_SETS.balanced).toEqual(
      ['Location:CN', 'Private', 'Non-China', 'Github', 'Google', 'Youtube', 'AI Services', 'Telegram']
    );
  });

  it('every extended group has at least one site_rules entry', () => {
    UNIFIED_RULES.filter(r => r.extended).forEach(r => {
      expect(r.site_rules.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/extended-rules.test.js`
Expected: FAIL (only original 18 rules, no `extended` property)

- [ ] **Step 3: Add extended groups and redefine comprehensive preset**

Edit `src/config/rules.js` — replace the closing `];` of `UNIFIED_RULES` (after "Non-China") and the `PREDEFINED_RULE_SETS` declaration as follows.

Before line 98 `	}`, `];`, insert (keep the `Non-China` entry, then append):

```js
	},
	// --- Extended groups (collapsed in UI by default) ---
	{ name: 'Discord',   site_rules: ['discord'],           ip_rules: [], extended: true },
	{ name: 'WhatsApp',  site_rules: ['whatsapp'],          ip_rules: [], extended: true },
	{ name: 'Signal',    site_rules: ['signal'],            ip_rules: [], extended: true },
	{ name: 'Line',      site_rules: ['line'],              ip_rules: [], extended: true },
	{ name: 'Zoom',      site_rules: ['zoom'],              ip_rules: [], extended: true },
	{ name: 'Spotify',   site_rules: ['spotify'],           ip_rules: [], extended: true },
	{ name: 'News',      site_rules: ['category-news-!cn'], ip_rules: [], extended: true },
	{ name: 'Reddit',    site_rules: ['reddit'],            ip_rules: [], extended: true },
	{ name: 'Twitch',    site_rules: ['twitch'],            ip_rules: [], extended: true },
	{ name: 'Pixiv',     site_rules: ['pixiv'],             ip_rules: [], extended: true },
	{ name: 'Developer', site_rules: ['category-dev-!cn'],  ip_rules: [], extended: true },
	{ name: 'OpenAI',    site_rules: ['openai'],            ip_rules: [], extended: true },
	{ name: 'Anthropic', site_rules: ['anthropic'],         ip_rules: [], extended: true },
	{ name: 'Speedtest', site_rules: ['speedtest'],         ip_rules: [], extended: true },
	{ name: 'Porn',      site_rules: ['category-porn'],     ip_rules: [], extended: true }
];
```

Then change the comprehensive preset definition:

```js
// Before:
//   comprehensive: UNIFIED_RULES.map(rule => rule.name)
// After:
export const PREDEFINED_RULE_SETS = {
	minimal: ['Location:CN', 'Private', 'Non-China'],
	balanced: ['Location:CN', 'Private', 'Non-China', 'Github', 'Google', 'Youtube', 'AI Services', 'Telegram'],
	comprehensive: UNIFIED_RULES.filter(rule => !rule.extended).map(rule => rule.name)
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/extended-rules.test.js test/selectedRules-compatibility.test.js`
Expected: PASS — extended-rules 5 tests, selectedRules-compatibility regression suite still passes.

- [ ] **Step 5: Commit**

```bash
git add src/config/rules.js test/extended-rules.test.js
git commit -m "feat: add 15 extended rule groups marked for collapsed UI"
```

---

## Task 3: resolveCustomRuleSetUrl helper

**Files:**
- Modify: `src/config/ruleGenerators.js:1-8` (imports)
- Modify: `src/config/ruleGenerators.js` (add helper)
- Test: `test/resolve-custom-rule-set-url.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/resolve-custom-rule-set-url.test.js
import { describe, it, expect } from 'vitest';
import { resolveCustomRuleSetUrl } from '../src/config/ruleGenerators.js';

describe('resolveCustomRuleSetUrl', () => {
  it('resolves metacubex site for all three formats', () => {
    const item = { name: 'MyReddit', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'Proxy' };
    expect(resolveCustomRuleSetUrl(item, 'singbox')).toContain('/geosite/reddit.srs');
    expect(resolveCustomRuleSetUrl(item, 'clash')).toContain('/geosite/reddit.mrs');
    expect(resolveCustomRuleSetUrl(item, 'surge')).toContain('/geosite/reddit.conf');
  });

  it('resolves blackmatrix7 with subdirectory pattern', () => {
    const item = { name: 'Notion', provider: 'blackmatrix7', file: 'Notion', type: 'site', outbound: 'Proxy' };
    expect(resolveCustomRuleSetUrl(item, 'singbox')).toContain('/sing-box/Notion/Notion.srs');
  });

  it('returns null for acl4ssr + singbox (format-gated)', () => {
    const item = { name: 'X', provider: 'acl4ssr', file: 'ProxyMedia', type: 'site', outbound: 'Proxy' };
    expect(resolveCustomRuleSetUrl(item, 'singbox')).toBeNull();
  });

  it('returns null for loyalsoldier + surge (format-gated)', () => {
    const item = { name: 'X', provider: 'loyalsoldier', file: 'proxy', type: 'site', outbound: 'Proxy' };
    expect(resolveCustomRuleSetUrl(item, 'surge')).toBeNull();
  });

  it('resolves custom provider via urls map', () => {
    const item = {
      name: 'MyCustom',
      provider: 'custom',
      file: '',
      urls: { singbox: 'https://example.com/foo.srs', clash: 'https://example.com/foo.mrs', surge: '' },
      type: 'site',
      outbound: 'Proxy'
    };
    expect(resolveCustomRuleSetUrl(item, 'singbox')).toBe('https://example.com/foo.srs');
    expect(resolveCustomRuleSetUrl(item, 'clash')).toBe('https://example.com/foo.mrs');
    expect(resolveCustomRuleSetUrl(item, 'surge')).toBeNull();
  });

  it('returns null for unknown provider', () => {
    const item = { name: 'X', provider: 'nonsense', file: 'a', type: 'site', outbound: 'Proxy' };
    expect(resolveCustomRuleSetUrl(item, 'singbox')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/resolve-custom-rule-set-url.test.js`
Expected: FAIL (export missing).

- [ ] **Step 3: Implement helper**

Append to `src/config/ruleGenerators.js`:

```js
import { resolveProviderUrl } from './ruleSetProviders.js';

/**
 * Resolve the rule-set file URL for a customRuleSets entry under a given format.
 * Returns null when the provider lacks the requested format (format-gated) or
 * when provider === 'custom' and no URL was supplied for that format.
 *
 *   format: 'singbox' | 'clash' | 'surge'
 */
export function resolveCustomRuleSetUrl(item, format) {
  if (!item || !item.type) return null;
  if (item.provider === 'custom') {
    const url = item.urls?.[format];
    return (typeof url === 'string' && url.length > 0) ? url : null;
  }
  if (!item.file) return null;
  return resolveProviderUrl(item.provider, item.type, format, item.file);
}
```

Also add the matching import at the top of the file, next to the existing imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/resolve-custom-rule-set-url.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config/ruleGenerators.js test/resolve-custom-rule-set-url.test.js
git commit -m "feat: add resolveCustomRuleSetUrl helper"
```

---

## Task 4: Extend generateRules to emit customRuleSets rules

**Files:**
- Modify: `src/config/ruleGenerators.js:32-71` (generateRules)
- Test: append to `test/resolve-custom-rule-set-url.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/resolve-custom-rule-set-url.test.js`:

```js
import { generateRules } from '../src/config/ruleGenerators.js';

describe('generateRules with customRuleSets', () => {
  it('appends one rule per customRuleSets item with _customRuleSet marker', () => {
    const rules = generateRules(
      ['Non-China'],
      [],
      [{ name: 'MyReddit', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'Proxy' }]
    );
    const custom = rules.filter(r => r._customRuleSet);
    expect(custom.length).toBe(1);
    expect(custom[0].outbound).toBe('Proxy');
    expect(custom[0].site_rules).toEqual(['MyReddit']);
  });

  it('uses ip_rules slot when type is ip', () => {
    const rules = generateRules(
      ['Non-China'],
      [],
      [{ name: 'MyIp', provider: 'metacubex', file: 'cloudflare', type: 'ip', outbound: 'Direct' }]
    );
    const custom = rules.find(r => r._customRuleSet);
    expect(custom.ip_rules).toEqual(['MyIp']);
    expect(custom.site_rules).toEqual([]);
  });

  it('empty customRuleSets preserves original output', () => {
    const before = generateRules(['Google'], []);
    const after = generateRules(['Google'], [], []);
    expect(after).toEqual(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/resolve-custom-rule-set-url.test.js`
Expected: FAIL (generateRules only takes 2 args — customRuleSets is ignored).

- [ ] **Step 3: Extend generateRules**

Edit `src/config/ruleGenerators.js`, change the `generateRules` signature and append a loop:

```js
export function generateRules(selectedRules = [], customRules = [], customRuleSets = []) {
	if (typeof selectedRules === 'string' && PREDEFINED_RULE_SETS[selectedRules]) {
		selectedRules = PREDEFINED_RULE_SETS[selectedRules];
	}

	if (!selectedRules || selectedRules.length === 0) {
		selectedRules = PREDEFINED_RULE_SETS.minimal;
	}

	const rules = [];

	UNIFIED_RULES.forEach(rule => {
		if (selectedRules.includes(rule.name)) {
			rules.push({
				site_rules: rule.site_rules,
				ip_rules: rule.ip_rules,
				domain_suffix: rule?.domain_suffix,
				ip_cidr: rule?.ip_cidr,
				outbound: rule.name
			});
		}
	});

	customRules.reverse();
	customRules.forEach((rule) => {
		rules.unshift({
			site_rules: toStringArray(rule.site),
			ip_rules: toStringArray(rule.ip),
			domain: toStringArray(rule.domain),
			domain_suffix: toStringArray(rule.domain_suffix),
			domain_keyword: toStringArray(rule.domain_keyword),
			ip_cidr: toStringArray(rule.ip_cidr),
			src_ip_cidr: toStringArray(rule.src_ip_cidr),
			protocol: toStringArray(rule.protocol),
			outbound: rule.name
		});
	});

	// customRuleSets: each item becomes a separate rule entry whose
	// site/ip rule name equals the user-chosen group name. Builders
	// read the _customRuleSet marker to emit the URL via resolveCustomRuleSetUrl.
	(customRuleSets || []).forEach((item) => {
		if (!item || !item.name || !item.type) return;
		rules.push({
			site_rules: item.type === 'site' ? [item.name] : [],
			ip_rules:   item.type === 'ip'   ? [item.name] : [],
			outbound: item.outbound || 'Proxy',
			_customRuleSet: item
		});
	});

	return rules;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/resolve-custom-rule-set-url.test.js`
Expected: PASS (now 9 tests total in that file).

- [ ] **Step 5: Commit**

```bash
git add src/config/ruleGenerators.js test/resolve-custom-rule-set-url.test.js
git commit -m "feat: generateRules emits rule entries for customRuleSets"
```

---

## Task 5: Extend generateRuleSets (sing-box) for customRuleSets

**Files:**
- Modify: `src/config/ruleGenerators.js:73-143` (generateRuleSets)
- Test: `test/custom-rule-sets-generation.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/custom-rule-sets-generation.test.js
import { describe, it, expect } from 'vitest';
import { generateRuleSets, generateClashRuleSets } from '../src/config/ruleGenerators.js';

describe('generateRuleSets (sing-box) with customRuleSets', () => {
  it('appends a site rule-set with the user name as tag and resolved URL', () => {
    const { site_rule_sets } = generateRuleSets(
      ['Non-China'],
      [],
      [{ name: 'MyReddit', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'Proxy' }]
    );
    const entry = site_rule_sets.find(r => r.tag === 'MyReddit');
    expect(entry).toBeTruthy();
    expect(entry.url).toContain('/geosite/reddit.srs');
    expect(entry.format).toBe('binary');
  });

  it('appends an ip rule-set with "-ip" suffix tag', () => {
    const { ip_rule_sets } = generateRuleSets(
      ['Non-China'],
      [],
      [{ name: 'MyIp', provider: 'metacubex', file: 'cloudflare', type: 'ip', outbound: 'Direct' }]
    );
    const entry = ip_rule_sets.find(r => r.tag === 'MyIp-ip');
    expect(entry).toBeTruthy();
    expect(entry.url).toContain('/geoip/cloudflare.srs');
  });

  it('skips items with null URL (format-gated)', () => {
    const { site_rule_sets } = generateRuleSets(
      ['Non-China'],
      [],
      [{ name: 'X', provider: 'acl4ssr', file: 'ProxyMedia', type: 'site', outbound: 'Proxy' }]
    );
    expect(site_rule_sets.find(r => r.tag === 'X')).toBeFalsy();
  });

  it('empty customRuleSets preserves original output', () => {
    const before = generateRuleSets(['Google'], []);
    const after = generateRuleSets(['Google'], [], []);
    expect(after.site_rule_sets).toEqual(before.site_rule_sets);
    expect(after.ip_rule_sets).toEqual(before.ip_rule_sets);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/custom-rule-sets-generation.test.js`
Expected: FAIL (customRuleSets param ignored).

- [ ] **Step 3: Extend generateRuleSets**

Edit `src/config/ruleGenerators.js` — change the `generateRuleSets` signature and append a loop before the final `return`:

```js
export function generateRuleSets(selectedRules = [], customRules = [], customRuleSets = []) {
	// ... existing body unchanged through the customRules loop ...

	// customRuleSets: resolve each URL per sing-box and push onto the right set
	(customRuleSets || []).forEach((item) => {
		if (!item || !item.name || !item.type) return;
		const url = resolveCustomRuleSetUrl(item, 'singbox');
		if (!url) return;   // format-gated or missing URL -> skip
		if (item.type === 'site') {
			site_rule_sets.push({ tag: item.name, type: 'remote', format: 'binary', url });
		} else {
			ip_rule_sets.push({ tag: `${item.name}-ip`, type: 'remote', format: 'binary', url });
		}
	});

	ruleSets.push(...site_rule_sets, ...ip_rule_sets);
	return { site_rule_sets, ip_rule_sets };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/custom-rule-sets-generation.test.js`
Expected: PASS (4 tests in this block).

- [ ] **Step 5: Commit**

```bash
git add src/config/ruleGenerators.js test/custom-rule-sets-generation.test.js
git commit -m "feat: generateRuleSets emits customRuleSets entries for sing-box"
```

---

## Task 6: Extend generateClashRuleSets for customRuleSets

**Files:**
- Modify: `src/config/ruleGenerators.js:146-235`
- Test: append to `test/custom-rule-sets-generation.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/custom-rule-sets-generation.test.js`:

```js
describe('generateClashRuleSets with customRuleSets', () => {
  it('emits a site provider with behavior=domain and resolved URL', () => {
    const { site_rule_providers } = generateClashRuleSets(
      ['Non-China'],
      [],
      true,
      [{ name: 'MyReddit', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'Proxy' }]
    );
    expect(site_rule_providers['MyReddit']).toBeTruthy();
    expect(site_rule_providers['MyReddit'].behavior).toBe('domain');
    expect(site_rule_providers['MyReddit'].url).toContain('/geosite/reddit.mrs');
  });

  it('emits an ip provider with behavior=ipcidr and -ip suffix key', () => {
    const { ip_rule_providers } = generateClashRuleSets(
      ['Non-China'],
      [],
      true,
      [{ name: 'MyIp', provider: 'metacubex', file: 'cloudflare', type: 'ip', outbound: 'Direct' }]
    );
    expect(ip_rule_providers['MyIp-ip']).toBeTruthy();
    expect(ip_rule_providers['MyIp-ip'].behavior).toBe('ipcidr');
  });

  it('skips format-gated acl4ssr + yaml=false (mrs) gracefully', () => {
    // acl4ssr has only .yaml for clash; when useMrs=true spec provides yaml anyway per design
    // test that an acl4ssr item resolves under clash
    const { site_rule_providers } = generateClashRuleSets(
      ['Non-China'],
      [],
      false,
      [{ name: 'Acl', provider: 'acl4ssr', file: 'ProxyMedia', type: 'site', outbound: 'Proxy' }]
    );
    expect(site_rule_providers['Acl']).toBeTruthy();
    expect(site_rule_providers['Acl'].url).toContain('.yaml');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/custom-rule-sets-generation.test.js`
Expected: FAIL (customRuleSets param ignored by generateClashRuleSets).

- [ ] **Step 3: Extend generateClashRuleSets**

Edit `src/config/ruleGenerators.js` — change the signature (`customRuleSets` **after** `useMrs` to keep existing call sites compatible) and append a loop before `return`:

```js
export function generateClashRuleSets(selectedRules = [], customRules = [], useMrs = true, customRuleSets = []) {
	// ... existing body ...

	// customRuleSets: resolve each URL under clash; respect useMrs only for providers that honor it
	(customRuleSets || []).forEach((item) => {
		if (!item || !item.name || !item.type) return;
		const url = resolveCustomRuleSetUrl(item, 'clash');
		if (!url) return;
		// Pick format based on URL extension (metacubex default is .mrs; others can be .yaml/.list)
		const lowerUrl = url.toLowerCase();
		const format = lowerUrl.endsWith('.mrs') ? 'mrs'
		             : lowerUrl.endsWith('.yaml') ? 'yaml'
		             : lowerUrl.endsWith('.list') ? 'text'
		             : (useMrs ? 'mrs' : 'yaml');
		const ext = (() => {
			if (lowerUrl.endsWith('.mrs')) return '.mrs';
			if (lowerUrl.endsWith('.yaml')) return '.yaml';
			if (lowerUrl.endsWith('.list')) return '.list';
			return useMrs ? '.mrs' : '.yaml';
		})();
		if (item.type === 'site') {
			site_rule_providers[item.name] = {
				type: 'http', format, behavior: 'domain', url,
				path: `./ruleset/${item.name}${ext}`, interval: 86400
			};
		} else {
			ip_rule_providers[`${item.name}-ip`] = {
				type: 'http', format, behavior: 'ipcidr', url,
				path: `./ruleset/${item.name}-ip${ext}`, interval: 86400
			};
		}
	});

	return { site_rule_providers, ip_rule_providers };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/custom-rule-sets-generation.test.js`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/config/ruleGenerators.js test/custom-rule-sets-generation.test.js
git commit -m "feat: generateClashRuleSets emits customRuleSets providers"
```

---

## Task 7: Wire customRuleSets through SingboxConfigBuilder and ClashConfigBuilder

**Files:**
- Modify: `src/builders/SingboxConfigBuilder.js:10-14` (constructor)
- Modify: `src/builders/SingboxConfigBuilder.js:451-452` (generate calls)
- Modify: `src/builders/ClashConfigBuilder.js:50-55` (constructor)
- Modify: `src/builders/ClashConfigBuilder.js:635-641` (generate calls)
- Test: `test/custom-rule-sets-builders.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/custom-rule-sets-builders.test.js
import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';

// minimal ss:// input accepted by the parser
const SAMPLE = 'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#Node1';

describe('SingboxConfigBuilder customRuleSets', () => {
  it('includes customRuleSets rule-set in generated config', async () => {
    const builder = new SingboxConfigBuilder(
      SAMPLE, ['Non-China'], [], null, 'en', '', false, false, '', '', '1.12', true,
      [{ name: 'MyReddit', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'Proxy' }]
    );
    const config = JSON.parse(await builder.build());
    const tags = (config.route?.rule_set || []).map(r => r.tag);
    expect(tags).toContain('MyReddit');
  });
});

describe('ClashConfigBuilder customRuleSets', () => {
  it('includes customRuleSets provider in generated config', async () => {
    const builder = new ClashConfigBuilder(
      SAMPLE, ['Non-China'], [], null, 'en', '', false, false, '', '', true,
      [{ name: 'MyReddit', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'Proxy' }]
    );
    const yaml = await builder.build();
    expect(yaml).toContain('MyReddit:');
    expect(yaml).toContain('/geosite/reddit.mrs');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/custom-rule-sets-builders.test.js`
Expected: FAIL (constructors don't accept the final customRuleSets arg).

- [ ] **Step 3: Extend builder constructors and generator call sites**

**SingboxConfigBuilder.js** — change constructor (around line 10):

```js
constructor(inputString, selectedRules, customRules, baseConfig, lang, userAgent, groupByCountry = false, enableClashUI = false, externalController, externalUiDownloadUrl, singboxVersion = '1.12', includeAutoSelect = true, customRuleSets = []) {
    // ... existing body ...
    this.customRuleSets = customRuleSets || [];
```

Change the two `generate*` calls (around line 451-452):

```js
const rules = generateRules(this.selectedRules, this.customRules, this.customRuleSets);
const { site_rule_sets, ip_rule_sets } = generateRuleSets(this.selectedRules, this.customRules, this.customRuleSets);
```

**ClashConfigBuilder.js** — change constructor (around line 50):

```js
constructor(inputString, selectedRules, customRules, baseConfig, lang, userAgent, groupByCountry = false, enableClashUI = false, externalController, externalUiDownloadUrl, includeAutoSelect = true, customRuleSets = []) {
    // ... existing body ...
    this.customRuleSets = customRuleSets || [];
```

Change `generateRules` and `generateClashRuleSets` call sites (around lines 635 and 641):

```js
return generateRules(this.selectedRules, this.customRules, this.customRuleSets);
// ...
const { site_rule_providers, ip_rule_providers } = generateClashRuleSets(
    this.selectedRules, this.customRules, useMrs, this.customRuleSets
);
```

**Also**: in both builders, after pushing the customRuleSets rules through `generateRules`, the builders need to know to treat `_customRuleSet`-marked rules as "already handled" vs going through the normal outbound-grouping logic. Inspect the builders' `getOutbounds` call chain: both use `getOutbounds(selectedRules)` which reads `UNIFIED_RULES`. `customRuleSets.name`s are not in `UNIFIED_RULES` so they won't create outbound groups automatically. Users choose an `outbound` from the existing ones (Proxy/Direct/Reject/selector), so no extra outbound plumbing is needed for this task.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/custom-rule-sets-builders.test.js test/clash-builder.test.js`
Expected: PASS (new 2 tests + existing clash-builder regression).

- [ ] **Step 5: Commit**

```bash
git add src/builders/SingboxConfigBuilder.js src/builders/ClashConfigBuilder.js test/custom-rule-sets-builders.test.js
git commit -m "feat: Singbox/Clash builders accept customRuleSets"
```

---

## Task 8: Extend Surge builder for customRuleSets

**Files:**
- Modify: `src/builders/SurgeConfigBuilder.js:8-11` (constructor)
- Modify: `src/builders/SurgeConfigBuilder.js:380` (generateRules call)
- Modify: `src/builders/SurgeConfigBuilder.js:465-475` (rule-set emission loops)
- Test: append to `test/custom-rule-sets-builders.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/custom-rule-sets-builders.test.js`:

```js
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

describe('SurgeConfigBuilder customRuleSets', () => {
  it('emits RULE-SET line for metacubex customRuleSets', async () => {
    const builder = new SurgeConfigBuilder(
      SAMPLE, ['Non-China'], [], null, 'en', '', false, true,
      [{ name: 'MyReddit', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'Proxy' }]
    );
    const text = await builder.build();
    expect(text).toMatch(/RULE-SET,.*\/geosite\/reddit\.conf,/);
  });

  it('skips loyalsoldier (no surge format) without failing', async () => {
    const builder = new SurgeConfigBuilder(
      SAMPLE, ['Non-China'], [], null, 'en', '', false, true,
      [{ name: 'LS', provider: 'loyalsoldier', file: 'proxy', type: 'site', outbound: 'Proxy' }]
    );
    const text = await builder.build();
    expect(text).not.toContain('LS');  // LS ruleset URL not emitted
    expect(text).toContain('FINAL');   // config is still well-formed
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/custom-rule-sets-builders.test.js`
Expected: FAIL (Surge builder ignores customRuleSets).

- [ ] **Step 3: Extend Surge builder**

Edit `src/builders/SurgeConfigBuilder.js`. Add the import at the top with the existing import block:

```js
import { resolveCustomRuleSetUrl } from '../config/ruleGenerators.js';
```

Change constructor (around line 8):

```js
constructor(inputString, selectedRules, customRules, baseConfig, lang, userAgent, groupByCountry, includeAutoSelect = true, customRuleSets = []) {
    super(inputString, baseConfig, lang, userAgent);
    this.selectedRules = selectedRules;
    this.customRules = customRules;
    this.groupByCountry = groupByCountry;
    this.includeAutoSelect = includeAutoSelect;
    this.customRuleSets = customRuleSets || [];
```

Change `generateRules` call (around line 380):

```js
const rules = generateRules(this.selectedRules, this.customRules, this.customRuleSets);
```

Change the two rule-set emission loops (around lines 465 and 473) to **skip customRuleSets-tagged rules** (because their `site_rules`/`ip_rules` names are user-chosen, not filenames on the Surge base URL):

```js
// Site rule-sets (normal UNIFIED_RULES + old-style customRules only)
rules.filter(rule => !rule._customRuleSet && rule.site_rules && rule.site_rules[0] !== '').map(rule => {
    rule.site_rules.forEach(site => {
        finalConfig.push(`RULE-SET,${SURGE_SITE_RULE_SET_BASEURL}${site}.conf,${this.t('outboundNames.' + rule.outbound)}`);
    });
});

// IP rule-sets (normal path)
rules.filter(rule => !rule._customRuleSet && rule.ip_rules && rule.ip_rules[0] !== '').map(rule => {
    rule.ip_rules.forEach(ip => {
        finalConfig.push(`RULE-SET,${SURGE_IP_RULE_SET_BASEURL}${ip}.txt,${this.t('outboundNames.' + rule.outbound)},no-resolve`);
    });
});

// customRuleSets: emit with resolved URL (skip when format-gated)
(this.customRuleSets || []).forEach(item => {
    if (!item || !item.name || !item.type) return;
    const url = resolveCustomRuleSetUrl(item, 'surge');
    if (!url) return;
    const outboundLabel = this.t('outboundNames.' + item.outbound);
    if (item.type === 'site') {
        finalConfig.push(`RULE-SET,${url},${outboundLabel}`);
    } else {
        finalConfig.push(`RULE-SET,${url},${outboundLabel},no-resolve`);
    }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/custom-rule-sets-builders.test.js test/surge-config-parser.test.js`
Expected: PASS (new 2 tests + existing surge regression).

- [ ] **Step 5: Commit**

```bash
git add src/builders/SurgeConfigBuilder.js test/custom-rule-sets-builders.test.js
git commit -m "feat: Surge builder emits customRuleSets RULE-SET lines"
```

---

## Task 9: Parse customRuleSets in createApp handlers

**Files:**
- Modify: `src/app/createApp.jsx` — four handlers at roughly lines 78, 134, 183, 222, and one pass at ~248
- Test: `test/subconverter-endpoint.test.js` (existing) regression + a new direct-request test

- [ ] **Step 1: Write the failing test**

```js
// Append to test/custom-rule-sets-builders.test.js

describe('Request handler customRuleSets parsing', () => {
  it('singbox endpoint accepts customRuleSets query param', async () => {
    // Use the app's fetch handler directly
    const { default: createApp } = await import('../src/app/createApp.jsx');
    const app = createApp();   // Hono app
    const qs = new URLSearchParams({
      url: SAMPLE,
      selectedRules: JSON.stringify(['Non-China']),
      customRuleSets: JSON.stringify([
        { name: 'MyReddit', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'Proxy' }
      ])
    });
    const res = await app.request(`/singbox?${qs}`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('MyReddit');
  });
});
```

Note: `createApp` may be exported differently (named vs default). Inspect `src/app/createApp.jsx` and adjust the import in step 3 if needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/custom-rule-sets-builders.test.js`
Expected: FAIL (customRuleSets not threaded through the handler).

- [ ] **Step 3: Add parse helper + thread through handlers**

Open `src/app/createApp.jsx`. Near the top (after imports), add the parse helper:

```js
function parseCustomRuleSets(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}
```

For each of the four handlers (sing-box, clash, surge, subconverter — lines ~78, 134, 183, 222), add:

```js
const customRuleSets = parseCustomRuleSets(c.req.query('customRuleSets'));
```

…and pass `customRuleSets` to the respective `ConfigBuilder` constructor as the new last parameter. Match the constructor parameter order exactly:

- `SingboxConfigBuilder(..., singboxVersion, includeAutoSelect, customRuleSets)`
- `ClashConfigBuilder(..., includeAutoSelect, customRuleSets)`
- `SurgeConfigBuilder(..., includeAutoSelect, customRuleSets)`

For the subconverter handler (around line 222) that already parses `selectedRules`, add the same `customRuleSets` parse and pass-through for whichever builder it instantiates.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/custom-rule-sets-builders.test.js test/subconverter-endpoint.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/createApp.jsx test/custom-rule-sets-builders.test.js
git commit -m "feat: thread customRuleSets through createApp handlers"
```

---

## Task 10: i18n entries for new groups and UI copy

**Files:**
- Modify: `src/i18n/index.js` — four language blocks (`zh`, `en`, `fa`, `ru`) around lines 115, 298, 475, 652 (existing `outboundNames` blocks)

- [ ] **Step 1: Add 15 display names per language inside each `outboundNames` block**

For each language, locate the `outboundNames: { ... }` block and add 15 new entries. Pick translations from the lists below. Keep the leading emoji pattern consistent with existing entries.

**zh (Chinese)** — around line 115-…:

```js
'Discord': '💬 Discord',
'WhatsApp': '💬 WhatsApp',
'Signal': '💬 Signal',
'Line': '💬 Line',
'Zoom': '📹 Zoom',
'Spotify': '🎵 Spotify',
'News': '📰 国际新闻',
'Reddit': '🗣️ Reddit',
'Twitch': '🎮 Twitch',
'Pixiv': '🎨 Pixiv',
'Developer': '💻 开发者工具',
'OpenAI': '🤖 OpenAI',
'Anthropic': '🤖 Anthropic',
'Speedtest': '📊 测速服务',
'Porn': '🔞 成人内容',
```

**en (English)** — around line 298:

```js
'Discord': '💬 Discord',
'WhatsApp': '💬 WhatsApp',
'Signal': '💬 Signal',
'Line': '💬 Line',
'Zoom': '📹 Zoom',
'Spotify': '🎵 Spotify',
'News': '📰 News Media',
'Reddit': '🗣️ Reddit',
'Twitch': '🎮 Twitch',
'Pixiv': '🎨 Pixiv',
'Developer': '💻 Developer Tools',
'OpenAI': '🤖 OpenAI',
'Anthropic': '🤖 Anthropic',
'Speedtest': '📊 Speedtest',
'Porn': '🔞 Adult Content',
```

**fa (Persian)** — around line 475:

```js
'Discord': '💬 دیسکورد',
'WhatsApp': '💬 واتس‌اپ',
'Signal': '💬 سیگنال',
'Line': '💬 لاین',
'Zoom': '📹 زوم',
'Spotify': '🎵 اسپاتیفای',
'News': '📰 اخبار',
'Reddit': '🗣️ ردیت',
'Twitch': '🎮 توییچ',
'Pixiv': '🎨 پیکسیو',
'Developer': '💻 ابزار توسعه',
'OpenAI': '🤖 اوپن‌ای‌آی',
'Anthropic': '🤖 آنتروپیک',
'Speedtest': '📊 تست سرعت',
'Porn': '🔞 محتوای بزرگسال',
```

**ru (Russian)** — around line 652:

```js
'Discord': '💬 Discord',
'WhatsApp': '💬 WhatsApp',
'Signal': '💬 Signal',
'Line': '💬 Line',
'Zoom': '📹 Zoom',
'Spotify': '🎵 Spotify',
'News': '📰 Новости',
'Reddit': '🗣️ Reddit',
'Twitch': '🎮 Twitch',
'Pixiv': '🎨 Pixiv',
'Developer': '💻 Разработчикам',
'OpenAI': '🤖 OpenAI',
'Anthropic': '🤖 Anthropic',
'Speedtest': '📊 Speedtest',
'Porn': '🔞 Для взрослых',
```

- [ ] **Step 2: Add UI copy keys per language**

Add these keys **alongside** the existing top-level keys in each language block (not inside `outboundNames`). Look for existing keys like `ruleSelection`, `custom`, `balanced` as positioning reference.

**zh:**
```js
extendedRuleGroups: '扩展规则组',
showMoreRuleGroups: '展开更多规则组',
hideMoreRuleGroups: '收起',
customRuleSetsSection: '自定义 RuleSet',
customRuleSetsSectionTooltip: '订阅公开 ruleset 文件，注册为独立分组',
ruleSetProvider: '源',
ruleSetFile: '文件名',
ruleSetUrlSingbox: 'URL (sing-box)',
ruleSetUrlClash: 'URL (Clash)',
ruleSetUrlSurge: 'URL (Surge)',
ruleSetType: '类型',
ruleSetOutbound: '出站',
ruleSetFileRequired: '请填写文件名',
ruleSetUrlRequired: '请至少填写一个 URL',
ruleSetProviderFormatUnsupported: '该源不支持当前客户端格式，导出时会被跳过',
addCustomRuleSet: '添加自定义 RuleSet',
noCustomRuleSetsForm: '暂无自定义 RuleSet',
```

**en:**
```js
extendedRuleGroups: 'Extended rule groups',
showMoreRuleGroups: 'Show more rule groups',
hideMoreRuleGroups: 'Hide',
customRuleSetsSection: 'Custom RuleSets',
customRuleSetsSectionTooltip: 'Subscribe to public ruleset files and register them as independent groups',
ruleSetProvider: 'Provider',
ruleSetFile: 'File name',
ruleSetUrlSingbox: 'URL (sing-box)',
ruleSetUrlClash: 'URL (Clash)',
ruleSetUrlSurge: 'URL (Surge)',
ruleSetType: 'Type',
ruleSetOutbound: 'Outbound',
ruleSetFileRequired: 'File name is required',
ruleSetUrlRequired: 'At least one URL is required',
ruleSetProviderFormatUnsupported: 'Provider does not support the current format; entry will be skipped on export',
addCustomRuleSet: 'Add custom RuleSet',
noCustomRuleSetsForm: 'No custom RuleSets yet',
```

**fa (Persian):**
```js
extendedRuleGroups: 'گروه‌های قوانین گسترده',
showMoreRuleGroups: 'نمایش گروه‌های بیشتر',
hideMoreRuleGroups: 'پنهان',
customRuleSetsSection: 'RuleSetهای سفارشی',
customRuleSetsSectionTooltip: 'اشتراک فایل‌های ruleset عمومی به‌عنوان گروه‌های مستقل',
ruleSetProvider: 'منبع',
ruleSetFile: 'نام فایل',
ruleSetUrlSingbox: 'URL (sing-box)',
ruleSetUrlClash: 'URL (Clash)',
ruleSetUrlSurge: 'URL (Surge)',
ruleSetType: 'نوع',
ruleSetOutbound: 'خروجی',
ruleSetFileRequired: 'نام فایل الزامی است',
ruleSetUrlRequired: 'حداقل یک URL لازم است',
ruleSetProviderFormatUnsupported: 'این منبع از فرمت فعلی پشتیبانی نمی‌کند؛ هنگام خروجی نادیده گرفته می‌شود',
addCustomRuleSet: 'افزودن RuleSet سفارشی',
noCustomRuleSetsForm: 'هنوز RuleSet سفارشی‌ای وجود ندارد',
```

**ru (Russian):**
```js
extendedRuleGroups: 'Расширенные группы правил',
showMoreRuleGroups: 'Показать больше групп',
hideMoreRuleGroups: 'Скрыть',
customRuleSetsSection: 'Пользовательские RuleSet',
customRuleSetsSectionTooltip: 'Подписка на публичные файлы ruleset как на отдельные группы',
ruleSetProvider: 'Источник',
ruleSetFile: 'Имя файла',
ruleSetUrlSingbox: 'URL (sing-box)',
ruleSetUrlClash: 'URL (Clash)',
ruleSetUrlSurge: 'URL (Surge)',
ruleSetType: 'Тип',
ruleSetOutbound: 'Исходящий',
ruleSetFileRequired: 'Имя файла обязательно',
ruleSetUrlRequired: 'Требуется хотя бы один URL',
ruleSetProviderFormatUnsupported: 'Источник не поддерживает текущий формат; запись будет пропущена при экспорте',
addCustomRuleSet: 'Добавить пользовательский RuleSet',
noCustomRuleSetsForm: 'Пока нет пользовательских RuleSet',
```

- [ ] **Step 3: Verify the build still loads**

Run: `npx vitest run test/index.test.js`
Expected: PASS (smoke test covers i18n init path).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/index.js
git commit -m "i18n: add extended rule group names and custom RuleSet UI strings (zh/en/fa/ru)"
```

---

## Task 11: Split extended groups in Form.jsx rule UI

**Files:**
- Modify: `src/components/Form.jsx:169-183` (rule-selection grid)

- [ ] **Step 1: Replace the single `UNIFIED_RULES.map(...)` grid with a split view**

Replace the `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">…</div>` block (around lines 169-184) with:

```jsx
<div x-data="{ showExtended: false }">
    {/* Base groups */}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {UNIFIED_RULES.filter(rule => !rule.extended).map((rule) => (
            <label class="flex items-center p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors group">
                <input
                    type="checkbox"
                    value={rule.name}
                    x-model="selectedRules"
                    x-on:change="selectedPredefinedRule = 'custom'"
                    class="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                />
                <span class="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                    {t(`outboundNames.${rule.name}`)}
                </span>
            </label>
        ))}
    </div>

    {/* Disclosure button */}
    <button type="button"
        x-on:click="showExtended = !showExtended"
        class="mt-4 flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
        <i x-bind:class="showExtended ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
        <span x-text="showExtended ? '{t('hideMoreRuleGroups')}' : '{t('showMoreRuleGroups')} ({UNIFIED_RULES.filter(r => r.extended).length})'"></span>
    </button>

    {/* Extended groups (collapsed by default) */}
    <div x-show="showExtended"
         {...{'x-transition:enter': 'transition ease-out duration-300', 'x-transition:enter-start': 'opacity-0 -translate-y-2', 'x-transition:enter-end': 'opacity-100 translate-y-0'}}
         class="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {UNIFIED_RULES.filter(rule => rule.extended).map((rule) => (
            <label class="flex items-center p-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors group">
                <input
                    type="checkbox"
                    value={rule.name}
                    x-model="selectedRules"
                    x-on:change="selectedPredefinedRule = 'custom'"
                    class="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                />
                <span class="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                    {t(`outboundNames.${rule.name}`)}
                </span>
            </label>
        ))}
    </div>
</div>
```

Note: Alpine templated strings with `{t(...)}` interpolation from JSX work because Hono's JSX runtime serializes `{t(...)}` at render time — the result string lands inside `x-text`. Verify by running `wrangler dev` after this change.

- [ ] **Step 2: Smoke test in dev server**

Run: `npm run dev`
Navigate to http://localhost:8787, open "Advanced Options" → "Rule Selection". Confirm:
- The base 18 checkboxes render exactly as before.
- "Show more rule groups (15)" button appears below.
- Clicking expands a dashed-border grid with the 15 extended groups (checkboxes work, prefill from extended names in URL round-trips).

- [ ] **Step 3: Commit**

```bash
git add src/components/Form.jsx
git commit -m "feat(ui): collapse extended rule groups behind disclosure button"
```

---

## Task 12: CustomRuleSets.jsx component

**Files:**
- Create: `src/components/CustomRuleSets.jsx`

- [ ] **Step 1: Write the component**

```jsx
// src/components/CustomRuleSets.jsx
/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

export const CustomRuleSets = (props) => {
    const { t } = props;

    return (
        <div x-data="customRuleSetsData()" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <i class="fas fa-cloud-download-alt text-gray-400"></i>
                    {t('customRuleSetsSection')}
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
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('customRuleSetsSectionTooltip')}</p>

            {/* Form mode */}
            <div x-show="mode === 'form'">
                <template x-if="rules.length === 0">
                    <div class="text-center py-12 bg-gray-50 dark:bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <p class="text-gray-500 dark:text-gray-400 mb-4">{t('noCustomRuleSetsForm')}</p>
                        <button type="button" x-on:click="addRule()" class="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg">
                            {t('addCustomRuleSet')}
                        </button>
                    </div>
                </template>

                <div class="space-y-4">
                    <template x-for="(rule, index) in rules" x-bind:key="index">
                        <div class="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="font-medium" x-text="'#' + (index + 1) + ' ' + (rule.name || '(unnamed)')"></h3>
                                <button type="button" x-on:click="removeRule(index)" class="text-red-500 hover:text-red-700">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="col-span-1 md:col-span-2">
                                    <label class="block text-sm font-medium mb-1">{t('customRuleOutboundName')}</label>
                                    <input type="text" x-model="rule.name" placeholder="MyReddit" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-1">{t('ruleSetProvider')}</label>
                                    <select x-model="rule.provider" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                                        <option value="metacubex">MetaCubeX</option>
                                        <option value="blackmatrix7">blackmatrix7</option>
                                        <option value="loyalsoldier">Loyalsoldier</option>
                                        <option value="acl4ssr">ACL4SSR</option>
                                        <option value="custom">Custom URL</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-1">{t('ruleSetType')}</label>
                                    <select x-model="rule.type" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                                        <option value="site">site</option>
                                        <option value="ip">ip</option>
                                    </select>
                                </div>
                                <div x-show="rule.provider !== 'custom'" class="col-span-1 md:col-span-2">
                                    <label class="block text-sm font-medium mb-1">{t('ruleSetFile')}</label>
                                    <input type="text" x-model="rule.file" placeholder="reddit" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
                                </div>
                                <template x-if="rule.provider === 'custom'">
                                    <div class="col-span-1 md:col-span-2 space-y-3">
                                        <div>
                                            <label class="block text-sm font-medium mb-1">{t('ruleSetUrlSingbox')}</label>
                                            <input type="url" x-model="rule.urls.singbox" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium mb-1">{t('ruleSetUrlClash')}</label>
                                            <input type="url" x-model="rule.urls.clash" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium mb-1">{t('ruleSetUrlSurge')}</label>
                                            <input type="url" x-model="rule.urls.surge" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
                                        </div>
                                    </div>
                                </template>
                                <div class="col-span-1 md:col-span-2">
                                    <label class="block text-sm font-medium mb-1">{t('ruleSetOutbound')}</label>
                                    <input type="text" x-model="rule.outbound" placeholder="Proxy" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
                                </div>
                            </div>
                        </div>
                    </template>
                </div>

                <div class="mt-6 flex flex-wrap gap-3">
                    <button type="button" x-on:click="addRule()" class="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 rounded-lg flex items-center gap-2">
                        <i class="fas fa-plus"></i>
                        {t('addCustomRuleSet')}
                    </button>
                    <button type="button" x-on:click="clearAll()" x-show="rules.length > 0" class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-lg flex items-center gap-2">
                        <i class="fas fa-trash"></i>
                        {t('clearAll')}
                    </button>
                </div>
            </div>

            {/* JSON mode */}
            <div x-show="mode === 'json'">
                <textarea x-model="jsonContent" rows={12} class="w-full px-4 py-2 font-mono text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" placeholder='[{"name":"MyReddit","provider":"metacubex","file":"reddit","type":"site","outbound":"Proxy"}]'></textarea>
                <p x-show="jsonError" class="mt-2 text-sm text-red-600" x-text="jsonError"></p>
            </div>

            <input type="hidden" name="customRuleSets" x-bind:value="JSON.stringify(rules)" />

            <script dangerouslySetInnerHTML={{
                __html: `
                function customRuleSetsData() {
                    return {
                        mode: 'form',
                        rules: [],
                        jsonContent: '[]',
                        jsonError: null,
                        init() {
                            this.$watch('rules', (v) => {
                                if (this.mode === 'form') this.jsonContent = JSON.stringify(v, null, 2);
                            });
                            this.$watch('jsonContent', (v) => {
                                if (this.mode === 'json') {
                                    try {
                                        const parsed = JSON.parse(v);
                                        if (Array.isArray(parsed)) { this.rules = parsed; this.jsonError = null; }
                                        else this.jsonError = 'must be array';
                                    } catch (e) { this.jsonError = e.message; }
                                }
                            });
                            window.addEventListener('restore-custom-rule-sets', (event) => {
                                if (event.detail && Array.isArray(event.detail.rules)) {
                                    this.rules = event.detail.rules;
                                    this.jsonContent = JSON.stringify(event.detail.rules, null, 2);
                                    this.mode = 'json';
                                }
                            });
                        },
                        addRule() {
                            this.rules.push({
                                name: '', provider: 'metacubex', file: '',
                                urls: { singbox: '', clash: '', surge: '' },
                                type: 'site', outbound: 'Proxy'
                            });
                        },
                        removeRule(i) { this.rules.splice(i, 1); },
                        clearAll() {
                            if (!confirm('${t('confirmClearAllRules')}')) return;
                            this.rules = [];
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

- [ ] **Step 2: Commit**

```bash
git add src/components/CustomRuleSets.jsx
git commit -m "feat(ui): add CustomRuleSets form component"
```

---

## Task 13: Mount CustomRuleSets in Form.jsx

**Files:**
- Modify: `src/components/Form.jsx` — add import at top and place `<CustomRuleSets />` after the existing `<CustomRules t={t} />`

- [ ] **Step 1: Edit Form.jsx**

At the top of `src/components/Form.jsx`, next to the existing `import { CustomRules } from './CustomRules.jsx';`, add:

```jsx
import { CustomRuleSets } from './CustomRuleSets.jsx';
```

Find the existing line `<CustomRules t={t} />` (near where the grid ends, around line 185) and add immediately after:

```jsx
<CustomRules t={t} />
<CustomRuleSets t={t} />
```

- [ ] **Step 2: Dev server smoke test**

Run: `npm run dev`
Open `http://localhost:8787`, expand Advanced → verify "Custom RuleSets" card appears below "Custom Rules" card. Add a rule with provider=metacubex, file=reddit, type=site, outbound=Proxy, submit, inspect generated config — expect rule-set tag `MyReddit` (or whatever name) in the output.

- [ ] **Step 3: Commit**

```bash
git add src/components/Form.jsx
git commit -m "feat(ui): mount CustomRuleSets below CustomRules"
```

---

## Task 14: Serialize customRuleSets into share URL

**Files:**
- Modify: `src/components/formLogic.js:209-219` (short URL generation) and ~385-388 (full URL generation)
- Test: `test/formLogic.test.js` (extend existing)

- [ ] **Step 1: Extend tests**

Append to `test/formLogic.test.js`:

```js
// NOTE: formLogic is UI-side JS run via Alpine. These tests exercise
// the serialization helper functions by importing them directly.

describe('formLogic customRuleSets serialization', () => {
  // If formLogic.js exports helpers, import here; otherwise use a DOM fixture.
  // Adjust based on existing test patterns in the same file.
  it('includes customRuleSets param when non-empty', () => {
    const params = new URLSearchParams();
    const customRuleSets = [{ name: 'X', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'Proxy' }];
    params.append('customRuleSets', JSON.stringify(customRuleSets));
    expect(params.get('customRuleSets')).toBeTruthy();
    const parsed = JSON.parse(params.get('customRuleSets'));
    expect(parsed[0].name).toBe('X');
  });
});
```

(This test serves as a behavior sketch. The actual integration happens in Task 16's E2E test, which goes through the full builder path.)

- [ ] **Step 2: Edit formLogic.js — short URL path (around line 216-220)**

Inside the existing `if (Array.isArray(this.selectedRules) && this.selectedRules.length > 0) { ... params.append('selectedRules', JSON.stringify(this.selectedRules)); }` block, right after the `customRules` append, add:

```js
// Include customRuleSets when available
try {
    const customRuleSetsInput = document.querySelector('input[name="customRuleSets"]');
    const customRuleSets = customRuleSetsInput && customRuleSetsInput.value ? JSON.parse(customRuleSetsInput.value) : [];
    if (Array.isArray(customRuleSets) && customRuleSets.length > 0) {
        params.append('customRuleSets', JSON.stringify(customRuleSets));
    }
} catch (e) {
    console.warn('Failed to serialize customRuleSets:', e);
}
```

- [ ] **Step 3: Edit formLogic.js — full URL path (around line 380-389)**

In the same pattern, near the existing full-URL `customRules` serialization, add the analogous block for `customRuleSets`. Mirror the exact try/catch shape used by Step 2.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/formLogic.test.js`
Expected: PASS (existing suite + new sketch).

- [ ] **Step 5: Commit**

```bash
git add src/components/formLogic.js test/formLogic.test.js
git commit -m "feat: serialize customRuleSets into share URL params"
```

---

## Task 15: Restore customRuleSets from URL

**Files:**
- Modify: `src/components/formLogic.js:565-578` (URL restore path)

- [ ] **Step 1: Edit formLogic.js restore path**

After the existing `customRules` restore block (around lines 565-578 — the one that dispatches `restore-custom-rules`), add:

```js
// Extract customRuleSets
const customRuleSets = params.get('customRuleSets');
if (customRuleSets) {
    try {
        const parsed = JSON.parse(customRuleSets);
        if (Array.isArray(parsed) && parsed.length > 0) {
            window.dispatchEvent(new CustomEvent('restore-custom-rule-sets', { detail: { rules: parsed } }));
        }
    } catch (e) {
        console.warn('Failed to parse customRuleSets:', e);
    }
}
```

Also extend the `if (selectedRules || customRules || ...)` guard at line ~608 to include `customRuleSets`:

```js
if (selectedRules || customRules || customRuleSets || this.groupByCountry || this.enableClashUI ||
```

- [ ] **Step 2: Dev server smoke test**

Run: `npm run dev`

- Open the app, add a Custom RuleSet (metacubex / reddit / site / Proxy), generate share URL.
- Copy URL, open in fresh incognito tab.
- Verify the Custom RuleSets card repopulates in JSON mode with the previously-added entry.

- [ ] **Step 3: Commit**

```bash
git add src/components/formLogic.js
git commit -m "feat: restore customRuleSets from share URL params"
```

---

## Task 16: E2E test — full round-trip per format

**Files:**
- Create: `test/custom-rule-sets-e2e.test.js`

- [ ] **Step 1: Write the test**

```js
// test/custom-rule-sets-e2e.test.js
import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

const SAMPLE = 'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#Node1';

const SELECTION = ['Google', 'Youtube', 'AI Services', 'Reddit', 'Discord'];  // 3 base + 2 extended
const CUSTOM_RULESETS = [
    { name: 'MyMeta', provider: 'metacubex', file: 'spotify', type: 'site', outbound: 'Proxy' },
    { name: 'MyCustom', provider: 'custom', file: '',
      urls: {
          singbox: 'https://example.com/custom.srs',
          clash:   'https://example.com/custom.mrs',
          surge:   'https://example.com/custom.list'
      },
      type: 'site', outbound: 'Proxy' }
];

describe('Custom RuleSets E2E', () => {
  it('sing-box output contains both customRuleSets tags', async () => {
    const b = new SingboxConfigBuilder(SAMPLE, SELECTION, [], null, 'en', '', false, false, '', '', '1.12', true, CUSTOM_RULESETS);
    const config = JSON.parse(await b.build());
    const tags = (config.route?.rule_set || []).map(r => r.tag);
    expect(tags).toContain('MyMeta');
    expect(tags).toContain('MyCustom');
    // Extended group works too:
    expect(tags).toContain('reddit');
    expect(tags).toContain('discord');
  });

  it('clash output contains both customRuleSets providers', async () => {
    const b = new ClashConfigBuilder(SAMPLE, SELECTION, [], null, 'en', '', false, false, '', '', true, CUSTOM_RULESETS);
    const yaml = await b.build();
    expect(yaml).toContain('MyMeta:');
    expect(yaml).toContain('MyCustom:');
    expect(yaml).toContain('https://example.com/custom.mrs');
    expect(yaml).toContain('/geosite/spotify.mrs');
  });

  it('surge output contains both customRuleSets RULE-SET lines', async () => {
    const b = new SurgeConfigBuilder(SAMPLE, SELECTION, [], null, 'en', '', false, true, CUSTOM_RULESETS);
    const text = await b.build();
    expect(text).toMatch(/RULE-SET,.*spotify\.conf,/);
    expect(text).toContain('https://example.com/custom.list');
  });

  it('backward compat: empty customRuleSets produces same output as omitting param', async () => {
    const b1 = new SingboxConfigBuilder(SAMPLE, SELECTION, [], null, 'en', '', false, false, '', '', '1.12', true);
    const b2 = new SingboxConfigBuilder(SAMPLE, SELECTION, [], null, 'en', '', false, false, '', '', '1.12', true, []);
    expect(await b1.build()).toBe(await b2.build());
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run test/custom-rule-sets-e2e.test.js`
Expected: PASS (4 tests).

- [ ] **Step 3: Run the whole suite**

Run: `npm test -- --run`
Expected: All tests pass. Any newly-failing tests from unrelated suites indicate a regression — investigate before moving on.

- [ ] **Step 4: Commit**

```bash
git add test/custom-rule-sets-e2e.test.js
git commit -m "test: E2E round-trip for customRuleSets across three formats"
```

---

## Task 17: README docs update

**Files:**
- Modify: `README.md`
- Modify: `README.zh-Hans.md`

- [ ] **Step 1: Add a short section to `README.md`**

Under a heading like `## Rule Groups`, add:

```markdown
### Extended rule groups

15 additional rule groups (Discord, WhatsApp, Signal, Line, Zoom, Spotify, News, Reddit, Twitch, Pixiv, Developer, OpenAI, Anthropic, Speedtest, Porn) are available behind a "Show more rule groups" disclosure in the Rule Selection card. They are not included in any preset; check them individually when you want them. Presets (`minimal`, `balanced`, `comprehensive`) are unchanged.

### Custom RuleSets

You can subscribe to any public rule-set file and register it as an independent proxy group. Expand "Custom RuleSets" under Advanced Options and add an entry:

- **Provider**: pick from MetaCubeX, blackmatrix7, Loyalsoldier, ACL4SSR, or Custom URL
- **File name** (for non-custom providers): e.g. `reddit`, `spotify`, `Notion`
- **Custom URL** (for `Custom URL` provider): supply one URL per format — sing-box (.srs), Clash (.mrs/.yaml), Surge (.list). Only the formats you fill in will work.
- **Type**: `site` for domain rule-sets, `ip` for IP CIDR rule-sets
- **Outbound**: the proxy group for matched traffic (`Proxy`, `Direct`, `Reject`, or a selector name)

Entries survive share-link round-trips via the `customRuleSets` URL parameter.
```

- [ ] **Step 2: Mirror to `README.zh-Hans.md`**

Add the Chinese translation of the same section at the equivalent location.

- [ ] **Step 3: Commit**

```bash
git add README.md README.zh-Hans.md
git commit -m "docs: describe extended rule groups and custom RuleSets"
```

---

## Final Verification

- [ ] **Run full suite**

Run: `npm test -- --run`
Expected: All green.

- [ ] **Dev server manual smoke test**

Run: `npm run dev`

Checklist:
- Advanced → Rule Selection shows 18 base checkboxes by default.
- "Show more rule groups (15)" expands a dashed-border section.
- Checking an extended group adds it to `selectedRules`; export works.
- Custom RuleSets card below Custom Rules accepts form entries.
- Export to sing-box / Clash / Surge all include the custom rule-set references.
- Copy share URL → paste into fresh tab → both extended checkboxes and custom RuleSets are restored.
- Legacy URL without `customRuleSets` param still works identically.
