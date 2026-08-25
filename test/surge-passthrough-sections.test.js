import { describe, it, expect } from 'vitest';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

const SAMPLE = 'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#Node1';

// Build a Surge config from a base config object (after parser conversion) and
// extract a named section's body lines from the produced text.
async function buildAndExtractSection(baseConfig, sectionName) {
    const builder = new SurgeConfigBuilder(
        SAMPLE, ['Non-China'], [], baseConfig, 'en', '', false, true, []
    );
    const text = await builder.build();
    const re = new RegExp(`\\[${sectionName.replace(/[\\^$.*+?()[\\]{}|]/g, '\\$&')}\\]\\n([\\s\\S]*?)(?=\\n\\[|$)`);
    const match = text.match(re);
    return match ? match[1].trim().split('\n') : [];
}

describe('SurgeConfigBuilder — passthrough sections from base config', () => {
    it('emits raw [General] and [Replica] lines without changing quotes', async () => {
        const base = {
            general: { 'leading-zero': 1 },
            'general-lines': [
                'leading-zero = "001"',
                'quoted = "a quoted value: \\"text\\"; path: C:\\\\Proxy"',
                '#!include General.dconf'
            ],
            replica: { enabled: false },
            'replica-lines': ['enabled = "false"']
        };

        expect(await buildAndExtractSection(base, 'General')).toEqual(base['general-lines']);
        expect(await buildAndExtractSection(base, 'Replica')).toEqual(base['replica-lines']);
    });

    it('emits proxy comments and directives without adding them to groups', async () => {
        const base = {
            general: {},
            proxies: [
                '# hash note',
                '; semicolon note',
                '// slash note',
                '#!include Proxy.dconf',
                'Base = http, 127.0.0.1, 8080'
            ]
        };
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], [], base, 'en', '', false, true, []
        );
        const text = await builder.build();
        const proxyLines = await buildAndExtractSection(base, 'Proxy');
        const proxyGroups = text.match(/\[Proxy Group\]\n([\s\S]*?)(?=\n\[|$)/)?.[1] || '';

        expect(proxyLines).toEqual(expect.arrayContaining(base.proxies));
        expect(proxyGroups).not.toContain('# hash note');
        expect(proxyGroups).not.toContain('; semicolon note');
        expect(proxyGroups).not.toContain('// slash note');
        expect(proxyGroups).not.toContain('#!include Proxy.dconf');
        expect(proxyGroups).toContain('Base');
    });

    it('uses object-form General when an input config overrides the base', async () => {
        const base = {
            general: { value: 1 },
            'general-lines': ['value = "001"']
        };
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], [], base, 'en', '', false, true, []
        );
        builder.applyConfigOverrides({ general: { value: 'override' } });

        const text = await builder.build();

        expect(text).toContain('value = override');
        expect(text).not.toContain('value = "001"');
    });

    it('emits [Host] section with raw lines', async () => {
        const base = {
            general: {},
            host: ['*.company.ponte = 127.0.0.1', 'mailserver = server 10.0.0.1']
        };
        const lines = await buildAndExtractSection(base, 'Host');
        expect(lines).toContain('*.company.ponte = 127.0.0.1');
        expect(lines).toContain('mailserver = server 10.0.0.1');
    });

    it('emits [URL Rewrite] section', async () => {
        const base = {
            general: {},
            'url-rewrite': ['^https?://old\\.example\\.com https://new.example.com 302']
        };
        const lines = await buildAndExtractSection(base, 'URL Rewrite');
        expect(lines[0]).toContain('old\\.example\\.com');
    });

    it('emits [Header Rewrite] section', async () => {
        const base = {
            general: {},
            'header-rewrite': ['^https?://example\\.com header-replace User-Agent Surge']
        };
        const lines = await buildAndExtractSection(base, 'Header Rewrite');
        expect(lines[0]).toContain('header-replace');
    });

    it('emits [MITM] section', async () => {
        const base = {
            general: {},
            mitm: ['hostname = *.example.com', 'ca-passphrase = secret']
        };
        const lines = await buildAndExtractSection(base, 'MITM');
        expect(lines).toContain('hostname = *.example.com');
        expect(lines).toContain('ca-passphrase = secret');
    });

    it('emits [Script] section', async () => {
        const base = {
            general: {},
            script: ['example-script = type=http-response,pattern=^https://example\\.com,script-path=foo.js']
        };
        const lines = await buildAndExtractSection(base, 'Script');
        expect(lines[0]).toContain('script-path=foo.js');
    });

    it('emits [SSID Setting] section', async () => {
        const base = {
            general: {},
            'ssid-setting': ['"FreeWiFi" wifi-access = false']
        };
        const lines = await buildAndExtractSection(base, 'SSID Setting');
        expect(lines[0]).toContain('FreeWiFi');
    });

    it('emits [Ponte] section', async () => {
        const base = {
            general: {},
            ponte: [
                'client-proxy-name = Relay-Proxy',
                'server-proxy-name = Proxy-A, Proxy-B'
            ]
        };
        const lines = await buildAndExtractSection(base, 'Ponte');
        expect(lines).toEqual([
            'client-proxy-name = Relay-Proxy',
            'server-proxy-name = Proxy-A, Proxy-B'
        ]);
    });

    it('emits named or future passthrough sections', async () => {
        const base = {
            general: {},
            'passthrough-sections': [
                { name: 'WireGuard Home', lines: ['private-key = example'] }
            ]
        };
        const lines = await buildAndExtractSection(base, 'WireGuard Home');
        expect(lines).toEqual(['private-key = example']);
    });

    it('does not emit empty passthrough sections', async () => {
        const base = { general: {}, host: [] };
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], [], base, 'en', '', false, true, []
        );
        const text = await builder.build();
        expect(text).not.toContain('[Host]');
    });

    it('emits passthrough sections in canonical order after [Rule]', async () => {
        const base = {
            general: {},
            // mixed-up declaration order; output must follow canonical order
            'ssid-setting': ['"X" wifi-access = false'],
            host: ['*.x.ponte = 1.2.3.4'],
            mitm: ['hostname = *.x.com'],
            'url-rewrite': ['^https://x https://y 302'],
            script: ['s = type=http-response,pattern=^https://x,script-path=s.js'],
            'header-rewrite': ['^https://x header-replace UA Surge']
        };
        const builder = new SurgeConfigBuilder(
            SAMPLE, ['Non-China'], [], base, 'en', '', false, true, []
        );
        const text = await builder.build();
        const order = ['[Rule]', '[Host]', '[URL Rewrite]', '[Header Rewrite]', '[MITM]', '[Script]', '[SSID Setting]'];
        const positions = order.map(s => text.indexOf(s));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        // none should be -1
        for (const p of positions) expect(p).toBeGreaterThan(-1);
    });
});
