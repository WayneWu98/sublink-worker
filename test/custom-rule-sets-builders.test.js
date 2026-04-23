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
    const config = await builder.build();
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
    expect(text).not.toContain('LS,');
    expect(text).toContain('FINAL');
  });
});
