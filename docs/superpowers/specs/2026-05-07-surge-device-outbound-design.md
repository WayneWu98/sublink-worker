# Surge `DEVICE:device_name` Outbound Support — Design

**Date:** 2026-05-07
**Scope:** Allow `DEVICE:device_name` as an outbound target in custom rules and custom rule sets, for Surge output. Cross-platform fallback: skip on Clash / Sing-box.

## Motivation

Surge supports routing traffic to another device on the LAN via the `DEVICE:device_name` policy (Ponte feature). Today, `sublink-worker`'s outbound dropdowns are restricted to:

- Built-ins: `Node Select`, `Auto Select`, `Fall Back`, `Manual Switch`, `DIRECT`, `REJECT`
- Selected predefined rule groups (e.g. `Ad Block`, `Microsoft`)
- Other declared custom rule set names

There is no way to express "route this rule via my Ponte device `tower`". This spec adds first-class support.

## Non-Goals

- **Fallback Outbound (FINAL rule):** Out of scope. Fallback dropdown remains `Node Select / DIRECT / REJECT`.
- **Cross-platform DEVICE emulation:** Clash and Sing-box have no equivalent; rules with DEVICE outbound are skipped silently when generating those formats.
- **Surge built-in device discovery:** Users declare device names manually; we do not query the user's Surge instance.

## User-Facing Surface

### New: "Surge Devices" section

A new top-level section in the form, sibling to "Custom Rule Sets". Renders before "Custom Rules" so declarations are visible upfront.

- Form mode: list of entries; each entry has a single field `name` (e.g. `tower`, `my-iphone`).
- JSON mode: `[{"name":"tower"}, {"name":"my-iphone"}]`.
- Validation per entry: name non-empty, no commas, no whitespace, no newlines (matches Surge identifier constraints — Surge would otherwise mis-parse the policy).
- Hidden form input `surgeDevices` carries the JSON for submit & URL persistence.
- Dispatches `surge-devices-changed` whenever the list mutates.
- Listens for `restore-surge-devices` to rehydrate from URL.

### Updated: Custom Rules and Custom Rule Sets dropdowns

Outbound `<select>` in both `CustomRules.jsx` and `CustomRuleSets.jsx` gains:

```jsx
<optgroup label={t('outboundSurgeDevices')} x-show="surgeDeviceNames().length > 0">
  <template x-for="n in surgeDeviceNames()" x-bind:key="n">
    <option x-bind:value="'DEVICE:' + n" x-text="'DEVICE:' + n"></option>
  </template>
</optgroup>
```

The stored value is the **full** `DEVICE:tower` string (not bare `tower`); builders detect the prefix.

Each component:

- Adds helper `surgeDeviceNames()` reading `input[name="surgeDevices"]` (mirrors existing `customRuleSetNames()`).
- Adds a `surgeDevicesVersion` reactive counter, bumped on `surge-devices-changed`.
- Extends `isValidOutbound(value)`: if `value.startsWith('DEVICE:')`, accept iff `value.slice(7)` is in `surgeDeviceNames()`.
- Listens for `surge-devices-changed` and runs `validateOutbounds()` (auto-resets to `Node Select` if a previously selected device is removed).

### New i18n key

`outboundSurgeDevices` (e.g. zh-CN: `Surge 设备`, en: `Surge Devices`) added to all locales currently shipping `outboundBuiltIn`, `outboundSelectedRules`, `outboundPriorRulesets`.

## Persistence

The Surge devices list **must** persist via URL params, otherwise reopening a shared link silently drops `DEVICE:*` outbounds: device list comes back empty → `isValidOutbound` rejects `DEVICE:tower` → `validateOutbounds` resets the rule's outbound to `Node Select`.

### Encode — `formLogic.js getSubconverterUrl`

Mirrors the existing `customRuleSets` pattern:

```js
try {
  const surgeDevicesInput = document.querySelector('input[name="surgeDevices"]');
  const surgeDevices = surgeDevicesInput && surgeDevicesInput.value
    ? JSON.parse(surgeDevicesInput.value) : [];
  if (Array.isArray(surgeDevices) && surgeDevices.length > 0) {
    params.append('surgeDevices', JSON.stringify(surgeDevices));
  }
} catch {}
```

### Decode — `formLogic.js populateFormFromUrl`

Dispatch order matters. Restore declarations **before** their consumers so validators see populated lists:

```
1. surgeDevices       (declarations)
2. customRuleSets     (declarations + may reference surgeDevices)
3. customRules        (consumers; reference both above)
```

All three are synchronous `dispatchEvent` calls, so a strict source order in `populateFormFromUrl` is sufficient.

```js
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

## Builder Changes

A single helper, prefix-based detection, lives in `BaseConfigBuilder.js`:

```js
export function isDeviceOutbound(value) {
  return typeof value === 'string' && value.startsWith('DEVICE:');
}
```

No need to thread the device list through to builders — the `DEVICE:` prefix is self-describing.

### `SurgeConfigBuilder.js` — direct passthrough

1. **`resolveCustomRuleSetDefault(item)`** — if `item.outbound` is DEVICE, return verbatim (skip `t('outboundNames.' + raw)` translation).

2. **`addCustomRuleGroups(proxyList)`** — skip group creation when `rule.name` is DEVICE:

   ```js
   if (isDeviceOutbound(rule.name)) return;
   ```

3. **`addCustomRuleSetGroups(proxyList)`** — skip wrapper group when `item.outbound` is DEVICE; the rule-set line will emit `DEVICE:xxx` directly:

   ```js
   if (isDeviceOutbound(item.outbound)) return;
   ```

4. **`formatConfig()`** rule emission — replace each `this.t('outboundNames.' + rule.outbound)` call with a small helper:

   ```js
   const policy = isDeviceOutbound(rule.outbound)
     ? rule.outbound
     : this.t('outboundNames.' + rule.outbound);
   ```

   Applied to: SRC-IP rule, DOMAIN, DOMAIN-SUFFIX, DOMAIN-KEYWORD, RULE-SET (built-in site/ip), IP-CIDR.

5. **`formatConfig()` custom rule sets loop** (around line 517) — when `item.outbound` is DEVICE, emit:

   ```
   RULE-SET,<url>,DEVICE:xxx          # site
   RULE-SET,<url>,DEVICE:xxx,no-resolve  # ip
   ```

   instead of using the rule-set's `name` as the policy.

### `ClashConfigBuilder.js` — skip rules with DEVICE outbound

1. **`addCustomRuleGroups`**: `if (isDeviceOutbound(rule.name)) return;`
2. **`addCustomRuleSetGroups`**: `if (isDeviceOutbound(item.outbound)) return;` — also drop the group; the rule-provider entry must be skipped too.
3. **Rule-provider emission** (`generateClashRuleSets` consumers): filter out rule sets whose `outbound` is DEVICE, and filter custom rules whose `name` is DEVICE before they reach the YAML `rules:` section.

   The cleanest filter point is post-`generateRules`: builders apply `rules.filter(r => !isDeviceOutbound(r.outbound))` before emitting. For custom rule sets, also skip the matching rule-provider entry.

4. **No new optgroup needed** in the dropdown beyond the shared change in step 2 above — the dropdown is shared across targets, but the value `DEVICE:xxx` is harmless for Clash rendering since we filter at the builder.

### `SingboxConfigBuilder.js` — same as Clash

1. `addCustomRuleGroups`: skip DEVICE (no `outbound` tag created).
2. `addCustomRuleSetGroups`: skip DEVICE (no selector group).
3. In rule emission (post-`generateRules`), filter `rules.filter(r => !isDeviceOutbound(r.outbound))` before pushing into the route `rules` array.
4. In rule-set declarations (`generateRuleSets`), skip rule-set entries owned by a custom rule set whose `outbound` is DEVICE — avoids orphan `route.rule_set` tags with no consumer.

### `createApp.jsx`

No changes. `surgeDevices` is purely UI-side state. The server already ignores unknown query params.

## Files Touched

- **New:** `src/components/SurgeDevices.jsx`
- **New i18n key:** `outboundSurgeDevices` added to all four locales in `src/i18n/index.js` (zh-CN, en, fa, ru), placed next to `outboundPriorRulesets`
- **Modify:** `src/components/CustomRules.jsx` — dropdown optgroup, `surgeDeviceNames()`, validator, listener
- **Modify:** `src/components/CustomRuleSets.jsx` — same
- **Modify:** `src/components/Form.jsx` — render `<SurgeDevices>` above `<CustomRuleSets>`
- **Modify:** `src/components/formLogic.js` — encode/decode in URL
- **Modify:** `src/builders/BaseConfigBuilder.js` — add `isDeviceOutbound` export
- **Modify:** `src/builders/SurgeConfigBuilder.js` — passthrough
- **Modify:** `src/builders/ClashConfigBuilder.js` — skip
- **Modify:** `src/builders/SingboxConfigBuilder.js` — skip

## Test Plan

For each builder (Surge, Clash, Sing-box), one snapshot test:

- Input: a custom rule set `{name:'MyDev',type:'site',outbound:'DEVICE:tower',...}` and a custom rule `{name:'DEVICE:my-iphone',domain_suffix:'work.com'}`
- Surge expectation: `RULE-SET,<url>,DEVICE:tower` and `DOMAIN-SUFFIX,work.com,DEVICE:my-iphone` emitted; no `MyDev` or `DEVICE:my-iphone` proxy group created
- Clash expectation: neither rule emitted; no `MyDev` group; no rule-provider `MyDev` entry
- Sing-box expectation: same as Clash

Plus one form-logic test: encode → decode round-trips `surgeDevices` and rehydrates dropdown options.

## Risks and Edge Cases

- **Surge identifier validation.** If a user types a name like `my device` (with space) or `dev,1` (with comma), Surge would mis-parse. Validation rejects these inputs.
- **Removed device → orphan rule.** If a user removes a device that's still referenced by a rule, `validateOutbounds` (triggered by `surge-devices-changed`) resets the rule's outbound to `Node Select`. Same behavior as removing a referenced custom rule set today.
- **JSON mode bypass.** A user in JSON mode can hand-write `outbound: "DEVICE:typo"`. We accept it (Surge will treat it as an undefined device, which is a Surge-side warning at runtime, not our problem). The "Surge Devices" UI is a help, not a gatekeeper.
- **`RESERVED_OUTBOUNDS` interaction.** The current set is `{DIRECT, REJECT, REJECT-DROP, REJECT-TINYGIF, REJECT-NO-DROP}`. `DEVICE:xxx` does not collide and need not be added to the set — prefix detection is independent.
