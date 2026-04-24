import { describe, it, expect } from 'vitest';
import { generateRules } from '../src/config/ruleGenerators.js';
import { emitClashRules } from '../src/builders/helpers/clashConfigUtils.js';
import { createTranslator } from '../src/i18n/index.js';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

describe('Custom rule resolve_ip toggle (IP CIDR no-resolve)', () => {
    it('generateRules defaults resolve_ip to false when field is absent', () => {
        const rules = generateRules('minimal', [
            { name: 'LAN', ip_cidr: '8.8.8.8/32' }
        ]);
        expect(rules[0].outbound).toBe('LAN');
        expect(rules[0].resolve_ip).toBe(false);
    });

    it('generateRules coerces resolve_ip to boolean', () => {
        const rules = generateRules('minimal', [
            { name: 'LAN', ip_cidr: '8.8.8.8/32', resolve_ip: true }
        ]);
        expect(rules[0].resolve_ip).toBe(true);
    });

    it('emitClashRules emits no-resolve when resolve_ip is false (default)', () => {
        const t = createTranslator('zh-CN');
        const lines = emitClashRules([
            { outbound: 'LAN', ip_cidr: ['8.8.8.8/32'], resolve_ip: false }
        ], t);
        expect(lines).toContain('IP-CIDR,8.8.8.8/32,LAN,no-resolve');
    });

    it('emitClashRules omits no-resolve when resolve_ip is true', () => {
        const t = createTranslator('zh-CN');
        const lines = emitClashRules([
            { outbound: 'LAN', ip_cidr: ['8.8.8.8/32'], resolve_ip: true }
        ], t);
        expect(lines).toContain('IP-CIDR,8.8.8.8/32,LAN');
        expect(lines).not.toContain('IP-CIDR,8.8.8.8/32,LAN,no-resolve');
    });

    it('SurgeConfigBuilder emits no-resolve when resolve_ip is false', async () => {
        const input = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#HK';
        const customRules = [{ name: 'LAN', ip_cidr: '8.8.8.8/32' }];
        const builder = new SurgeConfigBuilder(input, 'minimal', customRules, null, 'zh-CN', 'test-agent');
        const text = await builder.build();
        expect(text).toContain('IP-CIDR,8.8.8.8/32,LAN,no-resolve');
    });

    it('SurgeConfigBuilder omits no-resolve when resolve_ip is true', async () => {
        const input = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#HK';
        const customRules = [{ name: 'LAN', ip_cidr: '8.8.8.8/32', resolve_ip: true }];
        const builder = new SurgeConfigBuilder(input, 'minimal', customRules, null, 'zh-CN', 'test-agent');
        const text = await builder.build();
        expect(text).toContain('IP-CIDR,8.8.8.8/32,LAN\n');
        expect(text).not.toContain('IP-CIDR,8.8.8.8/32,LAN,no-resolve');
    });

    it('resolve_ip does not affect RULE-SET IP (built-in) which always keeps no-resolve', async () => {
        const input = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#HK';
        const builder = new SurgeConfigBuilder(input, 'balanced', [], null, 'zh-CN', 'test-agent');
        const text = await builder.build();
        expect(text).toMatch(/RULE-SET,[^\n]+\.txt,[^,\n]+,no-resolve/);
    });
});
