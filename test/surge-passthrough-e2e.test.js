import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

const SAMPLE = 'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#Node1';

const createTestApp = () => createApp({
    kv: new MemoryKVAdapter(),
    assetFetcher: null,
    logger: console,
    config: { configTtlSeconds: 60, shortLinkTtlSeconds: null }
});

async function postJson(app, path, body) {
    const res = await app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return { status: res.status, text: await res.text() };
}

describe('e2e — Surge base config passthrough sections via /config + /surge', () => {
    it('JSON Surge base config with [Host] field round-trips through /surge', async () => {
        const app = createTestApp();
        const baseConfigJson = JSON.stringify({
            general: { loglevel: 'notify' },
            host: ['*.company.ponte = 127.0.0.1', 'mailserver = server 10.0.0.1']
        });

        // 1. Save base config
        const save = await postJson(app, '/config', { type: 'surge', content: baseConfigJson });
        expect(save.status).toBe(200);
        const configId = save.text.trim();
        expect(configId).toMatch(/^surge_/);

        // 2. Generate Surge config using the saved base
        const qs = new URLSearchParams({
            config: SAMPLE,
            configId,
            selectedRules: 'minimal'
        }).toString();
        const res = await app.request(`/surge?${qs}`);
        expect(res.status).toBe(200);
        const text = await res.text();

        // [General] should reflect our custom value
        expect(text).toContain('loglevel = notify');

        // [Host] section should be present with our directives
        expect(text).toMatch(/\[Host\]\n[\s\S]*\*\.company\.ponte = 127\.0\.0\.1/);
        expect(text).toContain('mailserver = server 10.0.0.1');
    });

    it('exact docker repro: host-only base config produces [Host] section', async () => {
        const app = createTestApp();
        // Same payload my docker curl used
        const save = await postJson(app, '/config', {
            type: 'surge',
            content: '{"general":{"loglevel":"notify"},"host":["*.company.ponte = 127.0.0.1"]}'
        });
        expect(save.status).toBe(200);
        const configId = save.text.trim();
        const res = await app.request(`/surge?config=${encodeURIComponent(SAMPLE)}&configId=${configId}&selectedRules=minimal`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain('loglevel = notify');
        expect(text).toContain('*.company.ponte = 127.0.0.1');
        expect(text).toMatch(/\n\[Host\]\n/);
    });

    it('Ponte-only base config round-trips through /surge', async () => {
        const app = createTestApp();
        const save = await postJson(app, '/config', {
            type: 'surge',
            content: JSON.stringify({
                ponte: [
                    'client-proxy-name = Relay-Proxy',
                    'server-proxy-name = Proxy-A, Proxy-B'
                ]
            })
        });
        expect(save.status).toBe(200);

        const qs = new URLSearchParams({
            config: SAMPLE,
            configId: save.text.trim(),
            selectedRules: 'minimal'
        }).toString();
        const res = await app.request(`/surge?${qs}`);
        expect(res.status).toBe(200);
        const text = await res.text();

        expect(text).toMatch(/\n\[Ponte\]\n/);
        expect(text).toContain('client-proxy-name = Relay-Proxy');
        expect(text).toContain('server-proxy-name = Proxy-A, Proxy-B');
    });

    it('preserves directives and quoted General values without polluting proxy groups', async () => {
        const app = createTestApp();
        const save = await postJson(app, '/config', {
            type: 'surge',
            content: JSON.stringify({
                general: { 'leading-zero': 1 },
                'general-lines': [
                    'leading-zero = "001"',
                    '#!include General.dconf'
                ],
                proxies: [
                    '// proxy note',
                    '#!include Proxy.dconf',
                    'Base = http, 127.0.0.1, 8080'
                ],
                host: [
                    "#!REQUIREMENT SYSTEM=='macOS' base.example = 127.0.0.1"
                ]
            })
        });
        expect(save.status).toBe(200);

        const qs = new URLSearchParams({
            config: SAMPLE,
            configId: save.text.trim(),
            selectedRules: 'minimal'
        }).toString();
        const res = await app.request(`/surge?${qs}`);
        const text = await res.text();
        const proxyGroups = text.match(/\[Proxy Group\]\n([\s\S]*?)(?=\n\[|$)/)?.[1] || '';

        expect(res.status).toBe(200);
        expect(text).toContain('leading-zero = "001"');
        expect(text).toContain('#!include General.dconf');
        expect(text).toContain('#!include Proxy.dconf');
        expect(text).toContain("#!REQUIREMENT SYSTEM=='macOS' base.example = 127.0.0.1");
        expect(proxyGroups).not.toContain('// proxy note');
        expect(proxyGroups).not.toContain('#!include Proxy.dconf');
        expect(proxyGroups).toContain('Base');
    });
});
