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
