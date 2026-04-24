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

  it('resolves acl4ssr for clash (yaml)', () => {
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
