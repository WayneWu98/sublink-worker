import { describe, it, expect } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

const inputString =
    'ss://YWVzLTI1Ni1nY206dGVzdA==@us1.example.com:8388#US-Node-1\n' +
    'ss://YWVzLTI1Ni1nY206dGVzdA==@uk1.example.com:8388#UK-Node-1';

describe('Custom rule: domain (exact match)', () => {
    describe('SingboxConfigBuilder', () => {
        it('emits a route rule with domain array when rule.domain is set', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain_suffix: [], domain_keyword: [], domain: ['a.com', 'b.com'] }
            ];
            const builder = new SingboxConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            await builder.build();

            const match = builder.config.route.rules.find(r =>
                Array.isArray(r.domain) && r.domain.includes('a.com') && r.domain.includes('b.com')
            );
            expect(match).toBeDefined();
            expect(match.outbound).toBe('MyRule');
        });

        it('combines domain, domain_suffix, domain_keyword on one route rule', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain: ['exact.com'], domain_suffix: ['suf.com'], domain_keyword: ['kw'] }
            ];
            const builder = new SingboxConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            await builder.build();

            const match = builder.config.route.rules.find(r =>
                Array.isArray(r.domain) && r.domain.includes('exact.com')
            );
            expect(match).toBeDefined();
            expect(match.domain_suffix).toEqual(['suf.com']);
            expect(match.domain_keyword).toEqual(['kw']);
        });

        it('does not emit empty domain rule when rule.domain is empty', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain_suffix: ['keep.com'], domain_keyword: [], domain: [] }
            ];
            const builder = new SingboxConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            await builder.build();

            const bogus = builder.config.route.rules.find(r =>
                Array.isArray(r.domain) && r.domain.length === 0
            );
            expect(bogus).toBeUndefined();
        });
    });

    describe('ClashConfigBuilder', () => {
        it('emits DOMAIN,<value> rule lines when rule.domain is set', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain_suffix: [], domain_keyword: [], domain: ['a.com', 'b.com'] }
            ];
            const builder = new ClashConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            await builder.build();

            const rules = builder.config.rules || [];
            expect(rules.some(r => r.startsWith('DOMAIN,a.com,'))).toBe(true);
            expect(rules.some(r => r.startsWith('DOMAIN,b.com,'))).toBe(true);
        });

        it('does not emit DOMAIN, line when rule.domain is empty', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain_suffix: ['keep.com'], domain_keyword: [], domain: [] }
            ];
            const builder = new ClashConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            await builder.build();

            const rules = builder.config.rules || [];
            expect(rules.some(r => r.startsWith('DOMAIN,,'))).toBe(false);
            expect(rules.some(r => /^DOMAIN,[^-]/.test(r))).toBe(false);
        });
    });

    describe('SurgeConfigBuilder', () => {
        it('emits DOMAIN,<value>,<outbound> lines when rule.domain is set', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain_suffix: [], domain_keyword: [], domain: ['a.com', 'b.com'] }
            ];
            const builder = new SurgeConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            const output = await builder.build();

            expect(output).toMatch(/^DOMAIN,a\.com,MyRule$/m);
            expect(output).toMatch(/^DOMAIN,b\.com,MyRule$/m);
        });

        it('does not emit DOMAIN, line when rule.domain is empty', async () => {
            const customRules = [
                { name: 'MyRule', site_rules: [], ip_rules: [], domain_suffix: ['keep.com'], domain_keyword: [], domain: [] }
            ];
            const builder = new SurgeConfigBuilder(inputString, 'minimal', customRules, null, 'zh-CN');
            const output = await builder.build();

            expect(output).not.toMatch(/^DOMAIN,,/m);
            expect(output).not.toMatch(/^DOMAIN,[a-zA-Z0-9]/m);
        });
    });
});
