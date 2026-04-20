# Custom Rule: Domain Full-Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `domain` field to custom rules so users can express exact-match domain rules (e.g. `DOMAIN,example.com,Proxy`), emitted correctly across sing-box, Clash, and Surge.

**Architecture:** `domain` is a new pass-through field: it enters as a comma-separated string in the UI, is normalized to a string array by `generateRules()`, and each builder reads `rule.domain` and emits its format-specific exact-match output. No naming translation between layers; sing-box's output key happens to also be `domain`, and Clash/Surge use the `DOMAIN,` rule-type prefix.

**Tech Stack:** Hono JSX + Alpine.js (UI), vanilla JS builders, Vitest.

---

## File Structure

**Modified:**
- `src/components/CustomRules.jsx` — add `domain` input and default value
- `src/i18n/index.js` — 3 new i18n keys × 4 locales (zh-CN, en, fa, ru)
- `src/config/ruleGenerators.js` — pass `domain` through `generateRules()`
- `src/builders/SingboxConfigBuilder.js` — emit `domain` in route rules
- `src/builders/helpers/clashConfigUtils.js` — emit `DOMAIN,` lines for Clash
- `src/builders/SurgeConfigBuilder.js` — emit `DOMAIN,` lines for Surge

**Created:**
- `test/custom-rule-domain-full.test.js` — regression test across all three builders

---

## Task 1: Add regression test (TDD — red)

**Files:**
- Create: `test/custom-rule-domain-full.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/custom-rule-domain-full.test.js
import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

const inputString =
    'ss://YWVzLTI1Ni1nY206dGVzdA==@us1.example.com:8388#US-Node-1\n' +
    'ss://YWVzLTI1Ni1nY206dGVzdA==@uk1.example.com:8388#UK-Node-1';

const NODE_SELECT = '🚀 节点选择';

describe('Custom rule: domain (exact match)', () => {
    describe('SingboxConfigBuilder', () => {
        it('emits a route rule with domain array when rule.domain is set', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain_suffix: [], domain_keyword: [], domain: ['a.com', 'b.com'] }
            ];
            const builder = new SingboxConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            await builder.build();

            const match = builder.config.route.rules.find(r =>
                Array.isArray(r.domain) && r.domain.includes('a.com') && r.domain.includes('b.com')
            );
            expect(match).toBeDefined();
            expect(match.outbound).toBe('MyRule');
        });

        it('combines domain, domain_suffix, domain_keyword on one route rule', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain: ['exact.com'], domain_suffix: ['suf.com'], domain_keyword: ['kw'] }
            ];
            const builder = new SingboxConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            await builder.build();

            const match = builder.config.route.rules.find(r =>
                Array.isArray(r.domain) && r.domain.includes('exact.com')
            );
            expect(match).toBeDefined();
            expect(match.domain_suffix).toEqual(['suf.com']);
            expect(match.domain_keyword).toEqual(['kw']);
        });

        it('does not emit empty domain rule when rule.domain is empty', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain_suffix: ['keep.com'], domain_keyword: [], domain: [] }
            ];
            const builder = new SingboxConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            await builder.build();

            const bogus = builder.config.route.rules.find(r =>
                Array.isArray(r.domain) && r.domain.length === 0
            );
            expect(bogus).toBeUndefined();
        });
    });

    describe('ClashConfigBuilder', () => {
        it('emits DOMAIN,<value> rule lines when rule.domain is set', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain_suffix: [], domain_keyword: [], domain: ['a.com', 'b.com'] }
            ];
            const builder = new ClashConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            await builder.build();

            const rules = builder.config.rules || [];
            expect(rules.some(r => r.startsWith('DOMAIN,a.com,'))).toBe(true);
            expect(rules.some(r => r.startsWith('DOMAIN,b.com,'))).toBe(true);
        });

        it('does not emit DOMAIN, line when rule.domain is empty', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain_suffix: ['keep.com'], domain_keyword: [], domain: [] }
            ];
            const builder = new ClashConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            await builder.build();

            const rules = builder.config.rules || [];
            expect(rules.some(r => r.startsWith('DOMAIN,,'))).toBe(false);
            expect(rules.some(r => /^DOMAIN,[^-]/.test(r))).toBe(false);
        });
    });

    describe('SurgeConfigBuilder', () => {
        it('emits DOMAIN,<value>,<outbound> lines when rule.domain is set', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain_suffix: [], domain_keyword: [], domain: ['a.com', 'b.com'] }
            ];
            const builder = new SurgeConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            const output = await builder.build();

            expect(output).toMatch(/^DOMAIN,a\.com,MyRule$/m);
            expect(output).toMatch(/^DOMAIN,b\.com,MyRule$/m);
        });

        it('does not emit DOMAIN, line when rule.domain is empty', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain_suffix: ['keep.com'], domain_keyword: [], domain: [] }
            ];
            const builder = new SurgeConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            const output = await builder.build();

            expect(output).not.toMatch(/^DOMAIN,,/m);
            expect(output).not.toMatch(/^DOMAIN,[a-zA-Z0-9]/m);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/custom-rule-domain-full.test.js`

Expected: all 7 tests FAIL (the current builders do not emit `DOMAIN,`/`domain:` from `rule.domain`).

- [ ] **Step 3: Commit the red test**

```bash
git add test/custom-rule-domain-full.test.js
git commit -m "test(custom-rule): add failing tests for domain exact-match field"
```

---

## Task 2: Pass `domain` through the rule generator

**Files:**
- Modify: `src/config/ruleGenerators.js:55-67`

- [ ] **Step 1: Add `domain` to the emitted rule object**

In [src/config/ruleGenerators.js](src/config/ruleGenerators.js), inside `generateRules()`, the `customRules.forEach` block currently pushes this object:

```javascript
rules.unshift({
    site_rules: toStringArray(rule.site),
    ip_rules: toStringArray(rule.ip),
    domain_suffix: toStringArray(rule.domain_suffix),
    domain_keyword: toStringArray(rule.domain_keyword),
    ip_cidr: toStringArray(rule.ip_cidr),
    src_ip_cidr: toStringArray(rule.src_ip_cidr),
    protocol: toStringArray(rule.protocol),
    outbound: rule.name
});
```

Add one line:

```javascript
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
```

- [ ] **Step 2: Run tests — still failing (expected)**

Run: `npx vitest run test/custom-rule-domain-full.test.js`

Expected: tests still FAIL — the generator now passes `domain` through, but no builder reads it yet. This task produces no test-level progress on its own; it's a prerequisite.

- [ ] **Step 3: Commit**

```bash
git add src/config/ruleGenerators.js
git commit -m "feat(rules): thread custom rule domain field through generator"
```

---

## Task 3: Singbox — emit `domain` in route rules

**Files:**
- Modify: `src/builders/SingboxConfigBuilder.js:486-495`

- [ ] **Step 1: Expand the domain branch to include `rule.domain`**

Current code ([src/builders/SingboxConfigBuilder.js:486-495](src/builders/SingboxConfigBuilder.js#L486-L495)):

```javascript
rules.filter(rule => hasMatchValues(rule.domain_suffix) || hasMatchValues(rule.domain_keyword)).map(rule => {
    const entry = {
        outbound: this.t(`outboundNames.${rule.outbound}`)
    };

    if (hasMatchValues(rule.domain_suffix)) entry.domain_suffix = rule.domain_suffix;
    if (hasMatchValues(rule.domain_keyword)) entry.domain_keyword = rule.domain_keyword;

    this.config.route.rules.push(attachProtocolIfNeeded(entry, rule));
});
```

Change to:

```javascript
rules.filter(rule => hasMatchValues(rule.domain) || hasMatchValues(rule.domain_suffix) || hasMatchValues(rule.domain_keyword)).map(rule => {
    const entry = {
        outbound: this.t(`outboundNames.${rule.outbound}`)
    };

    if (hasMatchValues(rule.domain)) entry.domain = rule.domain;
    if (hasMatchValues(rule.domain_suffix)) entry.domain_suffix = rule.domain_suffix;
    if (hasMatchValues(rule.domain_keyword)) entry.domain_keyword = rule.domain_keyword;

    this.config.route.rules.push(attachProtocolIfNeeded(entry, rule));
});
```

- [ ] **Step 2: Run sing-box tests**

Run: `npx vitest run test/custom-rule-domain-full.test.js -t SingboxConfigBuilder`

Expected: all 3 sing-box tests PASS.

- [ ] **Step 3: Full regression check**

Run: `npx vitest run`

Expected: existing tests still pass (no regression). Clash/Surge tests from the new file still fail; that's expected.

- [ ] **Step 4: Commit**

```bash
git add src/builders/SingboxConfigBuilder.js
git commit -m "feat(singbox): emit domain exact-match from custom rules"
```

---

## Task 4: Clash — emit `DOMAIN,` lines

**Files:**
- Modify: `src/builders/helpers/clashConfigUtils.js:7-29`

- [ ] **Step 1: Add a `domain` branch before the `domain_suffix` branch**

In [src/builders/helpers/clashConfigUtils.js](src/builders/helpers/clashConfigUtils.js), `emitClashRules()` currently has branches for `src_ip_cidr`, `domain_suffix`, `domain_keyword`, `site_rules`, `ip_rules`, `ip_cidr`. Insert a new branch between `src_ip_cidr` and `domain_suffix`:

```javascript
    rules
        .filter(rule => Array.isArray(rule.domain) && rule.domain.length > 0)
        .forEach(rule => {
            rule.domain.forEach(value => {
                if (!value) return;
                results.push(`DOMAIN,${value},${translator('outboundNames.' + rule.outbound)}`);
            });
        });
```

The resulting function body order should be: `src_ip_cidr` → `domain` → `domain_suffix` → `domain_keyword` → `site_rules` → `ip_rules` → `ip_cidr`.

- [ ] **Step 2: Run Clash tests**

Run: `npx vitest run test/custom-rule-domain-full.test.js -t ClashConfigBuilder`

Expected: both Clash tests PASS.

- [ ] **Step 3: Full regression check**

Run: `npx vitest run`

Expected: sing-box tests from the new file pass; Clash tests pass; Surge tests still fail; all other existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/builders/helpers/clashConfigUtils.js
git commit -m "feat(clash): emit DOMAIN, rule lines from custom rules"
```

---

## Task 5: Surge — emit `DOMAIN,` lines

**Files:**
- Modify: `src/builders/SurgeConfigBuilder.js:446-456`

- [ ] **Step 1: Add a `domain` branch before the `domain_suffix` branch**

In [src/builders/SurgeConfigBuilder.js](src/builders/SurgeConfigBuilder.js), find the block starting at line 446:

```javascript
        rules.filter(rule => !!rule.domain_suffix).map(rule => {
            rule.domain_suffix.forEach(suffix => {
                finalConfig.push(`DOMAIN-SUFFIX,${suffix},${this.t('outboundNames.' + rule.outbound)}`);
            });
        });
```

Insert a new block immediately before it:

```javascript
        rules.filter(rule => Array.isArray(rule.domain) && rule.domain.length > 0).map(rule => {
            rule.domain.forEach(value => {
                if (!value) return;
                finalConfig.push(`DOMAIN,${value},${this.t('outboundNames.' + rule.outbound)}`);
            });
        });
```

- [ ] **Step 2: Run Surge tests**

Run: `npx vitest run test/custom-rule-domain-full.test.js -t SurgeConfigBuilder`

Expected: both Surge tests PASS.

- [ ] **Step 3: Full regression check**

Run: `npx vitest run`

Expected: all 7 new tests PASS. All existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/builders/SurgeConfigBuilder.js
git commit -m "feat(surge): emit DOMAIN, rule lines from custom rules"
```

---

## Task 6: UI — add `domain` input to the custom rule form

**Files:**
- Modify: `src/components/CustomRules.jsx`

- [ ] **Step 1: Add the new input block**

In [src/components/CustomRules.jsx](src/components/CustomRules.jsx), find the Domain Suffix block (starts around line 100 with the comment `{/* Domain Suffix */}`). Insert a new block immediately **before** it:

```jsx
            {/* Domain (exact match) */}
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                    {t('customRuleDomain')}
                    <i class="fas fa-info-circle text-gray-400 hover:text-primary-500 cursor-help" title={t('customRuleDomainTooltip')}></i>
                </label>
                <input
                    type="text"
                    x-model="rule.domain"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                    placeholder={t('customRuleDomainPlaceholder')}
                />
            </div>
```

- [ ] **Step 2: Add `domain: ''` to `addRule()` default object**

In the same file, find `addRule()` inside the `customRulesData()` Alpine component:

```javascript
            addRule() {
              this.rules.push({
                name: '',
                domain_suffix: '',
                domain_keyword: '',
                src_ip_cidr: '',
                ip_cidr: '',
                protocol: '',
                site: '',
                ip: '',
                outbound: '' // ...
              });
            },
```

Change to:

```javascript
            addRule() {
              this.rules.push({
                name: '',
                domain: '',
                domain_suffix: '',
                domain_keyword: '',
                src_ip_cidr: '',
                ip_cidr: '',
                protocol: '',
                site: '',
                ip: '',
                outbound: ''
              });
            },
```

- [ ] **Step 3: Update JSON-mode placeholder example**

In the same file, find the `ValidatedTextarea` for JSON mode (around line 217). Current:

```jsx
          placeholder='[{"name": "MyRule", "src_ip_cidr": "192.168.1.13/32", "domain_suffix": "example.com", "outbound": "Proxy"}]'
```

Change to:

```jsx
          placeholder='[{"name": "MyRule", "domain": "example.com", "domain_suffix": "example.net", "outbound": "Proxy"}]'
```

- [ ] **Step 4: Start dev server and manual smoke test**

Run: `npm run dev`

In the browser:
1. Open the custom rules section, click "Add Custom Rule"
2. Verify the new "Domain (exact match)" field appears above "Domain Suffix"
3. Enter `name=Test`, `domain=a.com,b.com`, pick any outbound
4. Convert to sing-box and check the URL/result: look for `"domain":["a.com","b.com"]` in the route rules
5. Convert to Clash: look for `DOMAIN,a.com,Test` and `DOMAIN,b.com,Test` lines
6. Convert to Surge: same check

If any of those don't appear, debug before committing.

- [ ] **Step 5: Commit**

```bash
git add src/components/CustomRules.jsx
git commit -m "feat(ui): add domain exact-match input to custom rule form"
```

---

## Task 7: i18n — add 3 keys × 4 locales

**Files:**
- Modify: `src/i18n/index.js`

- [ ] **Step 1: Add zh-CN keys**

In [src/i18n/index.js](src/i18n/index.js), find line 69 (`customRuleDomainSuffix: '域名后缀',`). Insert above it:

```javascript
    customRuleDomain: '域名（精确匹配）',
    customRuleDomainTooltip: '完整域名精确匹配，不包含子域名（Sing-Box: domain；Clash/Surge: DOMAIN,）。如需匹配子域名请使用"域名后缀"。',
    customRuleDomainPlaceholder: '完整域名（用逗号分隔）',
```

- [ ] **Step 2: Add en keys**

Find line 250 (`customRuleDomainSuffix: 'Domain Suffix',`). Insert above it:

```javascript
    customRuleDomain: 'Domain (exact)',
    customRuleDomainTooltip: 'Exact match for a full domain — does not include subdomains (Sing-Box: domain; Clash/Surge: DOMAIN,). Use "Domain Suffix" to also match subdomains.',
    customRuleDomainPlaceholder: 'Full domain names (comma separated)',
```

- [ ] **Step 3: Add fa keys**

Find line 424 (`customRuleDomainSuffix: 'پسوند دامنه',`). Insert above it:

```javascript
    customRuleDomain: 'دامنه (دقیق)',
    customRuleDomainTooltip: 'تطبیق دقیق نام کامل دامنه — شامل زیردامنه‌ها نمی‌شود (Sing-Box: domain؛ Clash/Surge: DOMAIN,). برای تطبیق زیردامنه‌ها از "پسوند دامنه" استفاده کنید.',
    customRuleDomainPlaceholder: 'نام کامل دامنه (با کاما جدا شده)',
```

- [ ] **Step 4: Add ru keys**

Find line 598 (`customRuleDomainSuffix: 'Суффикс домена',`). Insert above it:

```javascript
    customRuleDomain: 'Домен (точное совпадение)',
    customRuleDomainTooltip: 'Точное совпадение полного имени домена — не включает поддомены (Sing-Box: domain; Clash/Surge: DOMAIN,). Для поддоменов используйте "Суффикс домена".',
    customRuleDomainPlaceholder: 'Полные доменные имена (через запятую)',
```

- [ ] **Step 5: Run full test suite one more time**

Run: `npx vitest run`

Expected: all tests pass (i18n changes should not break anything).

- [ ] **Step 6: Commit**

```bash
git add src/i18n/index.js
git commit -m "i18n: add custom rule domain field labels for zh-CN, en, fa, ru"
```

---

## Self-Review (already performed)

- **Spec coverage:** all 6 spec-listed file changes + the test file have corresponding tasks (Tasks 1–7). ✓
- **Placeholders:** none. Every step has either exact code or an exact command. ✓
- **Type consistency:** field name `domain` used throughout UI (`rule.domain`), generator (`domain: toStringArray(rule.domain)`), and all three builders (`rule.domain`). ✓
- **Ordering:** test-first (Task 1), then generator prerequisite (Task 2), then one builder per task (Tasks 3–5), finally UI + i18n (Tasks 6–7). UI depends on i18n keys existing, but i18n comes last — fine, because `t()` on a missing key returns the key string, so manual smoke testing in Task 6 still works; i18n Task 7 polishes the labels. Alternative would be to swap 6 and 7; both are valid.
