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
