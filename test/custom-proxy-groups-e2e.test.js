import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';

const SAMPLE = [
    'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#HK-1',
    'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.6:8388#US-1',
].join('\n');

function url(path, params) {
    const qs = new URLSearchParams();
    qs.append('lang', 'en');
    qs.append('config', SAMPLE);
    for (const [k, v] of Object.entries(params)) {
        qs.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    return `${path}?${qs}`;
}

describe('custom proxy groups — full integration', () => {
    const groups = [{ name: 'HK Auto', type: 'url-test', filter: 'HK' }];

    it('a custom group can be a custom-rule outbound target (Clash)', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: groups,
            customRules: [{ name: 'HK Auto', domain: 'example.com' }],
        }));
        const yaml = await res.text();
        expect(yaml).toContain('DOMAIN,example.com,HK Auto');
        expect(yaml).toContain('name: HK Auto');
    });

    it('a custom group can be the Fall Back target (Clash)', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: groups,
            fallback_outbound: 'HK Auto',
        }));
        const yaml = await res.text();
        const m = yaml.match(/name: 🐟 Fall Back[\s\S]*?proxies:\n((?:\s+-\s+.+\n)+)/);
        expect(m).toBeTruthy();
        expect(m[1].split('\n')[0].trim()).toBe('- HK Auto');
    });

    it('unknown fallback_outbound still defaults to Node Select and is never emitted', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: groups,
            fallback_outbound: 'EvilInjection',
        }));
        const yaml = await res.text();
        expect(yaml).not.toContain('EvilInjection');
    });

    it('works across all three formats without error', async () => {
        const app = createApp();
        for (const path of ['/clash', '/singbox', '/surge']) {
            const res = await app.request(url(path, { selectedRules: ['Non-China'], customProxyGroups: groups }));
            expect(res.status).toBe(200);
            expect(await res.text()).toContain('HK Auto');
        }
    });

    it('a DEVICE: member survives on Surge but is dropped on Clash', async () => {
        const app = createApp();
        const cpg = [{ name: 'Switch', type: 'select', proxies: ['Node Select', 'DEVICE:iPhone'] }];
        const surge = await (await app.request(url('/surge', { selectedRules: ['Non-China'], customProxyGroups: cpg }))).text();
        expect(surge).toMatch(/^Switch = select,.*DEVICE:iPhone/m);
        const clash = await (await app.request(url('/clash', { selectedRules: ['Non-China'], customProxyGroups: cpg }))).text();
        expect(clash).toContain('name: Switch'); // group still emitted (Node Select keeps it non-empty)
        expect(clash).not.toContain('DEVICE:iPhone');
    });
});
