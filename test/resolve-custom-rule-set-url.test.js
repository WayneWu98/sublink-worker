import { describe, it, expect } from 'vitest';
import { resolveCustomRuleSetUrl, generateRules } from '../src/config/ruleGenerators.js';

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
