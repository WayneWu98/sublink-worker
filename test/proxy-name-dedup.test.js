import { describe, expect, it } from 'vitest';
import { load as loadYaml } from 'js-yaml';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import { addProxyWithDedup } from '../src/builders/helpers/proxyHelpers.js';
import { encodeBase64 } from '../src/utils.js';

function createTestApp() {
    return createApp({
        kv: new MemoryKVAdapter(),
        assetFetcher: null,
        logger: console,
        config: {
            configTtlSeconds: 60,
            shortLinkTtlSeconds: null
        }
    });
}

function vmessLink(name, server, id) {
    return `vmess://${encodeBase64(JSON.stringify({
        v: '2',
        ps: name,
        add: server,
        port: '443',
        id,
        aid: '0',
        scy: 'auto',
        net: 'ws',
        type: 'none',
        host: server,
        path: '/',
        tls: 'tls'
    }))}`;
}

const VMESS_INPUT = [
    vmessLink('VMESS_OVER_WS_CDN', 'cdn.example.com', '11111111-1111-4111-8111-111111111111'),
    vmessLink('VMESS_OVER_WS', 'origin.example.com', '22222222-2222-4222-8222-222222222222')
].join('\n');

describe('proxy name deduplication', () => {
    it('only renames exact duplicate names', () => {
        const proxies = [{ name: 'VMESS_OVER_WS_CDN', server: 'cdn.example.com' }];

        addProxyWithDedup(proxies, { name: 'VMESS_OVER_WS', server: 'origin.example.com' });

        expect(proxies.map(proxy => proxy.name)).toEqual([
            'VMESS_OVER_WS_CDN',
            'VMESS_OVER_WS'
        ]);
    });

    it('uses the next available suffix for real duplicate names', () => {
        const proxies = [
            { name: 'Node', server: 'one.example.com' },
            { name: 'Node 2', server: 'two.example.com' }
        ];

        addProxyWithDedup(proxies, { name: 'Node', server: 'three.example.com' });

        expect(proxies.map(proxy => proxy.name)).toEqual(['Node', 'Node 2', 'Node 3']);
    });

    it.each(['singbox', 'clash', 'surge'])('preserves prefix-related names in /%s output', async (format) => {
        const app = createTestApp();
        const res = await app.request(`http://localhost/${format}?config=${encodeURIComponent(VMESS_INPUT)}&selectedRules=minimal`);

        expect(res.status).toBe(200);

        let names;
        if (format === 'singbox') {
            const config = await res.json();
            names = config.outbounds
                .filter(outbound => outbound.type === 'vmess')
                .map(outbound => outbound.tag);
        } else if (format === 'clash') {
            const config = loadYaml(await res.text());
            names = config.proxies.map(proxy => proxy.name);
        } else {
            names = (await res.text())
                .split('\n')
                .filter(line => line.startsWith('VMESS_OVER_WS'))
                .map(line => line.split('=')[0].trim());
        }

        expect(names).toEqual(['VMESS_OVER_WS_CDN', 'VMESS_OVER_WS']);
    });
});
