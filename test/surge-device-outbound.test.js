import { describe, it, expect } from 'vitest';
import { isDeviceOutbound } from '../src/builders/BaseConfigBuilder.js';

describe('isDeviceOutbound', () => {
    it('returns true for "DEVICE:tower"', () => {
        expect(isDeviceOutbound('DEVICE:tower')).toBe(true);
    });

    it('returns true for "DEVICE:my-iphone"', () => {
        expect(isDeviceOutbound('DEVICE:my-iphone')).toBe(true);
    });

    it('returns false for "Node Select"', () => {
        expect(isDeviceOutbound('Node Select')).toBe(false);
    });

    it('returns false for "DIRECT"', () => {
        expect(isDeviceOutbound('DIRECT')).toBe(false);
    });

    it('returns false for the empty string', () => {
        expect(isDeviceOutbound('')).toBe(false);
    });

    it('returns false for null/undefined/non-string input', () => {
        expect(isDeviceOutbound(null)).toBe(false);
        expect(isDeviceOutbound(undefined)).toBe(false);
        expect(isDeviceOutbound(42)).toBe(false);
        expect(isDeviceOutbound({})).toBe(false);
    });

    it('is case-sensitive (does not match "device:tower")', () => {
        expect(isDeviceOutbound('device:tower')).toBe(false);
    });
});

import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

const SAMPLE = 'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#Node1';

describe('SurgeConfigBuilder — DEVICE outbound on custom rules', () => {
    it('emits DOMAIN-SUFFIX,...,DEVICE:my-iphone verbatim', async () => {
        const customRules = [
            { name: 'DEVICE:my-iphone', domain_suffix: 'work.example.com' }
        ];
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], customRules, null, 'en', '', false, true, []
        );
        const text = await builder.build();
        expect(text).toContain('DOMAIN-SUFFIX,work.example.com,DEVICE:my-iphone');
    });

    it('does not create a "DEVICE:my-iphone" proxy group', async () => {
        const customRules = [
            { name: 'DEVICE:my-iphone', domain_suffix: 'work.example.com' }
        ];
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], customRules, null, 'en', '', false, true, []
        );
        const text = await builder.build();
        const proxyGroupSection = text.split('[Proxy Group]')[1].split('[Rule]')[0];
        expect(proxyGroupSection).not.toContain('DEVICE:my-iphone =');
    });

    it('does not call t() on DEVICE outbound (no translation prefix leakage)', async () => {
        const customRules = [
            { name: 'DEVICE:tower', domain: 'foo.com' }
        ];
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], customRules, null, 'en', '', false, true, []
        );
        const text = await builder.build();
        expect(text).toContain('DOMAIN,foo.com,DEVICE:tower');
        expect(text).not.toContain('outboundNames.DEVICE');
    });
});

describe('SurgeConfigBuilder — DEVICE outbound on custom rule sets', () => {
    it('emits RULE-SET pointing at DEVICE:tower instead of a wrapper group', async () => {
        const customRuleSets = [
            { name: 'MyDev', provider: 'metacubex', file: 'reddit', type: 'site', outbound: 'DEVICE:tower' }
        ];
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], [], null, 'en', '', false, true, customRuleSets
        );
        const text = await builder.build();
        expect(text).toMatch(/RULE-SET,.*\/geosite\/reddit\.conf,DEVICE:tower/);
        const proxyGroupSection = text.split('[Proxy Group]')[1].split('[Rule]')[0];
        expect(proxyGroupSection).not.toContain('MyDev =');
        expect(text).not.toMatch(/RULE-SET,.*reddit\.conf,MyDev/);
    });

    it('preserves no-resolve suffix for ip-type rule sets with DEVICE outbound', async () => {
        const customRuleSets = [
            { name: 'IpDev', provider: 'metacubex', file: 'cn', type: 'ip', outbound: 'DEVICE:tower' }
        ];
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], [], null, 'en', '', false, true, customRuleSets
        );
        const text = await builder.build();
        expect(text).toMatch(/RULE-SET,.*,DEVICE:tower,no-resolve/);
    });
});
