import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

const SAMPLE = 'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#Node1';

const SELECTION = ['Google', 'Youtube', 'AI Services', 'Reddit', 'Discord'];  // 3 base + 2 extended
const CUSTOM_RULESETS = [
    { name: 'MyMeta', provider: 'metacubex', file: 'spotify', type: 'site', outbound: 'Proxy' },
    {
        name: 'MyCustom', provider: 'custom', file: '',
        urls: {
            singbox: 'https://example.com/custom.srs',
            clash:   'https://example.com/custom.mrs',
            surge:   'https://example.com/custom.list'
        },
        type: 'site', outbound: 'Proxy'
    }
];

describe('Custom RuleSets E2E', () => {
    it('sing-box output contains both customRuleSets tags alongside extended groups', async () => {
        const b = new SingboxConfigBuilder(
            SAMPLE, SELECTION, [], null, 'en', '', false, false, '', '', '1.12', true,
            CUSTOM_RULESETS
        );
        const config = await b.build();
        const tags = (config.route?.rule_set || []).map(r => r.tag);
        expect(tags).toContain('MyMeta');
        expect(tags).toContain('MyCustom');
        expect(tags).toContain('reddit');
        expect(tags).toContain('discord');
    });

    it('clash output contains both customRuleSets providers and URLs', async () => {
        const b = new ClashConfigBuilder(
            SAMPLE, SELECTION, [], null, 'en', '', false, false, '', '', true,
            CUSTOM_RULESETS
        );
        const yaml = await b.build();
        expect(yaml).toContain('MyMeta:');
        expect(yaml).toContain('MyCustom:');
        expect(yaml).toContain('https://example.com/custom.mrs');
        expect(yaml).toContain('/geosite/spotify.mrs');
    });

    it('surge output contains both customRuleSets RULE-SET lines', async () => {
        const b = new SurgeConfigBuilder(
            SAMPLE, SELECTION, [], null, 'en', '', false, true,
            CUSTOM_RULESETS
        );
        const text = await b.build();
        expect(text).toMatch(/RULE-SET,.*spotify\.conf,/);
        expect(text).toContain('https://example.com/custom.list');
    });

    it('backward compat: empty customRuleSets produces same output as omitting the arg', async () => {
        const b1 = new SingboxConfigBuilder(SAMPLE, SELECTION, [], null, 'en', '', false, false, '', '', '1.12', true);
        const b2 = new SingboxConfigBuilder(SAMPLE, SELECTION, [], null, 'en', '', false, false, '', '', '1.12', true, []);
        const c1 = await b1.build();
        const c2 = await b2.build();
        expect(JSON.stringify(c1)).toBe(JSON.stringify(c2));
    });
});
