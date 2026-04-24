import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

const SAMPLE = 'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#Node1';

describe('Fall Back outbound — sing-box', () => {
  it('defaults the Fall Back selector to Node Select (current behaviour)', async () => {
    const b = new SingboxConfigBuilder(SAMPLE, ['Non-China'], [], null, 'en', '', false, false, '', '', '1.12', true);
    const config = await b.build();
    const fb = config.outbounds.find(o => o.tag === '🐟 Fall Back');
    expect(fb).toBeTruthy();
    // Member list always has Node Select first (legacy behaviour)
    expect(fb.outbounds[0]).toBe('🚀 Node Select');
  });

  it('sets selector default to DIRECT when fallbackOutbound = DIRECT', async () => {
    const b = new SingboxConfigBuilder(SAMPLE, ['Non-China'], [], null, 'en', '', false, false, '', '', '1.12', true, [], 'DIRECT');
    const config = await b.build();
    const fb = config.outbounds.find(o => o.tag === '🐟 Fall Back');
    expect(fb.default).toBe('DIRECT');
  });

  it('silently ignores fallbackOutbound when it is not in the Fall Back member list', async () => {
    const b = new SingboxConfigBuilder(SAMPLE, ['Non-China'], [], null, 'en', '', false, false, '', '', '1.12', true, [], 'Auto Select');
    const config = await b.build();
    const fb = config.outbounds.find(o => o.tag === '🐟 Fall Back');
    // Auto Select is not a Fall Back member in non-country mode; resolver skips rather than breaking
    expect(fb.default).toBeUndefined();
  });
});

describe('Fall Back outbound — clash', () => {
  it('moves chosen target to front of proxies list when fallbackOutbound = REJECT', async () => {
    const b = new ClashConfigBuilder(SAMPLE, ['Non-China'], [], null, 'en', '', false, false, '', '', true, [], 'REJECT');
    const yaml = await b.build();
    // Find the Fall Back group block in the YAML and check its first proxy entry
    const match = yaml.match(/name: 🐟 Fall Back[\s\S]*?proxies:\n((?:\s+-\s+.+\n)+)/);
    expect(match).toBeTruthy();
    const firstProxy = match[1].split('\n')[0].trim();
    expect(firstProxy).toBe('- REJECT');
  });
});

describe('Fall Back outbound — surge', () => {
  it('moves chosen target to front of surge select group when fallbackOutbound = DIRECT', async () => {
    const b = new SurgeConfigBuilder(SAMPLE, ['Non-China'], [], null, 'en', '', false, true, [], 'DIRECT');
    const text = await b.build();
    // Find the Fall Back proxy group line
    const fbLine = text.split('\n').find(l => l.startsWith('🐟 Fall Back'));
    expect(fbLine).toBeTruthy();
    // select,DIRECT,... (first selectable option is DIRECT)
    expect(fbLine).toMatch(/select,\s*DIRECT,/);
  });
});
