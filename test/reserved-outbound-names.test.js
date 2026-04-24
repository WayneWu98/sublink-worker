import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

const SAMPLE = 'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#Node1';
const SELECTED = ['Non-China'];

// Regression: CustomRule with name=DIRECT/REJECT/PASS must NOT create a same-
// named selector group (Surge rejects it outright; other clients silently
// break routing by shadowing the built-in action).

describe('Reserved outbound names guard — sing-box', () => {
  it('does NOT create an outbound with tag DIRECT when customRules references DIRECT', async () => {
    const b = new SingboxConfigBuilder(SAMPLE, SELECTED, [{ name: 'DIRECT', domain: 'example.com' }], null, 'en', '', false, false, '', '', '1.12', true);
    const config = await b.build();
    const directOutbounds = (config.outbounds || []).filter(o => o.type === 'selector' && o.tag === 'DIRECT');
    expect(directOutbounds).toHaveLength(0);
  });

  it('does NOT create a selector group when customRuleSets name is DIRECT', async () => {
    const b = new SingboxConfigBuilder(SAMPLE, SELECTED, [], null, 'en', '', false, false, '', '', '1.12', true,
      [{ name: 'DIRECT', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'Node Select' }]);
    const config = await b.build();
    const directSelectors = (config.outbounds || []).filter(o => o.type === 'selector' && o.tag === 'DIRECT');
    expect(directSelectors).toHaveLength(0);
  });
});

describe('Reserved outbound names guard — clash', () => {
  it('does NOT create a proxy-group named DIRECT when customRules references DIRECT', async () => {
    const b = new ClashConfigBuilder(SAMPLE, SELECTED, [{ name: 'DIRECT', domain: 'example.com' }], null, 'en', '', false, false, '', '', true);
    const yaml = await b.build();
    // No proxy-group block named DIRECT
    expect(yaml).not.toMatch(/name:\s*DIRECT\s*\n\s+type:\s*select/);
  });
});

describe('Reserved outbound names guard — surge', () => {
  it('does NOT emit a DIRECT=select proxy-group line when customRules references DIRECT', async () => {
    const b = new SurgeConfigBuilder(SAMPLE, SELECTED, [{ name: 'DIRECT', domain: 'example.com' }], null, 'en', '', false, true);
    const text = await b.build();
    expect(text).not.toMatch(/^DIRECT\s*=\s*select/m);
  });

  it('does NOT emit a REJECT=select proxy-group line when customRuleSets name is REJECT', async () => {
    const b = new SurgeConfigBuilder(SAMPLE, SELECTED, [], null, 'en', '', false, true,
      [{ name: 'REJECT', provider: 'metacubex', file: 'ads', type: 'site', outbound: 'Node Select' }]);
    const text = await b.build();
    expect(text).not.toMatch(/^REJECT\s*=\s*select/m);
  });
});
