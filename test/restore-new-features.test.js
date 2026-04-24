import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';

// Integration tests: build URLs the same way formLogic.js would,
// hit the public endpoints, and confirm the new features survive
// the query-string round-trip.

const SAMPLE = 'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#Node1';

function buildUrl(path, params) {
  const qs = new URLSearchParams();
  qs.append('lang', 'en');
  for (const [k, v] of Object.entries(params)) {
    qs.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  return `${path}?${qs}`;
}

describe('Restore: extended rule groups', () => {
  it('accepts extended group names in selectedRules and emits their rule-set', async () => {
    const app = createApp();
    const url = buildUrl('/clash', {
      config: SAMPLE,
      selectedRules: ['Non-China', 'Reddit', 'Discord']
    });
    const res = await app.request(url);
    expect(res.status).toBe(200);
    const yaml = await res.text();
    expect(yaml).toMatch(/reddit:\s*$/m);
    expect(yaml).toMatch(/discord:\s*$/m);
    expect(yaml).toContain('RULE-SET,reddit,');
    expect(yaml).toContain('RULE-SET,discord,');
  });
});

describe('Restore: fallbackOutbound param', () => {
  it('moves DIRECT to front of Fall Back proxies when fallback_outbound=DIRECT', async () => {
    const app = createApp();
    const url = buildUrl('/clash', {
      config: SAMPLE,
      selectedRules: ['Non-China'],
      fallback_outbound: 'DIRECT'
    });
    const res = await app.request(url);
    const yaml = await res.text();
    const match = yaml.match(/name: 🐟 Fall Back[\s\S]*?proxies:\n((?:\s+-\s+.+\n)+)/);
    expect(match).toBeTruthy();
    const first = match[1].split('\n')[0].trim();
    expect(first).toBe('- DIRECT');
  });

  it('silently ignores invalid fallback_outbound', async () => {
    const app = createApp();
    const url = buildUrl('/clash', {
      config: SAMPLE,
      selectedRules: ['Non-China'],
      fallback_outbound: 'EvilInjection'
    });
    const res = await app.request(url);
    expect(res.status).toBe(200);
    const yaml = await res.text();
    expect(yaml).not.toContain('EvilInjection');
    // Fall Back's first proxy should default to Node Select when invalid
    const match = yaml.match(/name: 🐟 Fall Back[\s\S]*?proxies:\n((?:\s+-\s+.+\n)+)/);
    expect(match[1].split('\n')[0].trim()).toMatch(/Node Select/);
  });
});

describe('Restore: customRuleSets full round-trip', () => {
  it('registers group + rule + rule-provider for a metacubex preset entry', async () => {
    const app = createApp();
    const url = buildUrl('/clash', {
      config: SAMPLE,
      selectedRules: ['Non-China'],
      customRuleSets: [{
        name: 'MyReddit',
        provider: 'metacubex',
        file: 'reddit',
        type: 'site',
        outbound: 'DIRECT'
      }]
    });
    const res = await app.request(url);
    expect(res.status).toBe(200);
    const yaml = await res.text();
    // rule-provider registered under the user-chosen name
    expect(yaml).toContain('MyReddit:');
    expect(yaml).toContain('/geosite/reddit.mrs');
    // Rule targets the new group
    expect(yaml).toContain('RULE-SET,MyReddit,MyReddit');
    // Proxy group created with DIRECT promoted to first (default)
    const gm = yaml.match(/name: MyReddit\s*\n\s*proxies:\n((?:\s+-\s+.+\n)+)/);
    expect(gm).toBeTruthy();
    expect(gm[1].split('\n')[0].trim()).toBe('- DIRECT');
  });

  it('preserves __uid-free JSON payload (stripped by the hidden input)', async () => {
    const app = createApp();
    const url = buildUrl('/clash', {
      config: SAMPLE,
      selectedRules: ['Non-China'],
      customRuleSets: [{ __uid: 'should-be-stripped-by-ui', name: 'X', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'DIRECT' }]
    });
    // Server ignores __uid since it's not a known field; nothing should crash.
    const res = await app.request(url);
    expect(res.status).toBe(200);
  });

  it('three customRuleSets in declaration order — emit order matches', async () => {
    const app = createApp();
    const url = buildUrl('/clash', {
      config: SAMPLE,
      selectedRules: ['Non-China'],
      customRuleSets: [
        { name: 'A', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'DIRECT' },
        { name: 'B', provider: 'metacubex', file: 'spotify', type: 'site', outbound: 'DIRECT' },
        { name: 'C', provider: 'metacubex', file: 'discord', type: 'site', outbound: 'DIRECT' }
      ]
    });
    const res = await app.request(url);
    const yaml = await res.text();
    const rulesIdx = yaml.indexOf('rules:');
    const tail = yaml.slice(rulesIdx);
    const aIdx = tail.indexOf('RULE-SET,A,');
    const bIdx = tail.indexOf('RULE-SET,B,');
    const cIdx = tail.indexOf('RULE-SET,C,');
    expect(aIdx).toBeGreaterThan(0);
    expect(aIdx).toBeLessThan(bIdx);
    expect(bIdx).toBeLessThan(cIdx);
  });
});

describe('Restore: customRules with new dropdown-only name', () => {
  it('routes matching domain to a built-in outbound (DIRECT)', async () => {
    const app = createApp();
    const url = buildUrl('/clash', {
      config: SAMPLE,
      selectedRules: ['Non-China'],
      customRules: [{ name: 'DIRECT', domain: 'example.com' }]
    });
    const res = await app.request(url);
    const yaml = await res.text();
    expect(yaml).toContain('DOMAIN,example.com,DIRECT');
  });

  it('routes matching domain to a selected rule group (Youtube)', async () => {
    const app = createApp();
    const url = buildUrl('/clash', {
      config: SAMPLE,
      selectedRules: ['Non-China', 'Youtube'],
      customRules: [{ name: 'Youtube', domain: 'custom-youtube-mirror.com' }]
    });
    const res = await app.request(url);
    const yaml = await res.text();
    expect(yaml).toContain('DOMAIN,custom-youtube-mirror.com,📹 Youtube');
  });
});
