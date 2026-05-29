import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';

const SAMPLE = [
    'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.4:8388#HK-1',
    'ss://YWVzLTI1Ni1nY206dGVzdA@1.2.3.5:8388#HK-2',
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

describe('Clash custom proxy groups', () => {
    it('emits a url-test group whose members are the filter-matched nodes', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: [{ name: 'HK Auto', type: 'url-test', filter: 'HK' }],
        }));
        expect(res.status).toBe(200);
        const yaml = await res.text();
        // js-yaml emits keys in insertion order; the builder inserts { type, name, proxies, url, ... }.
        const m = yaml.match(/type: url-test\n\s+name: HK Auto\n\s+proxies:\n((?:\s+-\s+.+\n)+)/);
        expect(m).toBeTruthy();
        expect(m[1]).toContain('- HK-1');
        expect(m[1]).toContain('- HK-2');
        expect(m[1]).not.toContain('- US-1');
        expect(yaml).toContain('url: http://www.gstatic.com/generate_204');
    });

    it('keeps the native type for select/fallback/load-balance', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: [
                { name: 'LB', type: 'load-balance', filter: 'HK|US' },
                { name: 'FB', type: 'fallback', filter: 'HK' },
            ],
        }));
        const yaml = await res.text();
        expect(yaml).toMatch(/type: load-balance\n\s+name: LB/);
        expect(yaml).toMatch(/type: fallback\n\s+name: FB/);
    });

    it('does NOT inject the custom group into Node Select members', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: [{ name: 'HK Auto', type: 'url-test', filter: 'HK' }],
        }));
        const yaml = await res.text();
        expect(yaml).toMatch(/name: HK Auto/); // the group itself is still emitted
        // ...but it is NOT auto-listed as a member of Node Select.
        const ns = yaml.match(/name: 🚀 Node Select\n\s+proxies:\n((?:\s+-\s+.+\n)+)/);
        expect(ns).toBeTruthy();
        expect(ns[1]).not.toContain('- HK Auto');
    });

    it('drops an empty group (filter matches nothing, no refs)', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customProxyGroups: [{ name: 'Ghost', type: 'url-test', filter: 'NOMATCH' }],
        }));
        const yaml = await res.text();
        expect(yaml).not.toContain('name: Ghost');
    });
});

describe('Singbox custom proxy groups', () => {
    it('emits a urltest group for url-test and degrades fallback/load-balance to urltest', async () => {
        const app = createApp();
        const res = await app.request(url('/singbox', {
            selectedRules: ['Non-China'],
            customProxyGroups: [
                { name: 'HK Auto', type: 'url-test', filter: 'HK' },
                { name: 'FB', type: 'fallback', filter: 'HK' },
                { name: 'LB', type: 'load-balance', filter: 'US' },
            ],
        }));
        expect(res.status).toBe(200);
        const json = JSON.parse(await res.text());
        const byTag = Object.fromEntries(json.outbounds.filter(o => o.tag).map(o => [o.tag, o]));
        expect(byTag['HK Auto'].type).toBe('urltest');
        expect(byTag['HK Auto'].outbounds).toEqual(expect.arrayContaining(['HK-1', 'HK-2']));
        expect(byTag['HK Auto'].outbounds).not.toContain('US-1');
        expect(byTag['FB'].type).toBe('urltest');
        expect(byTag['LB'].type).toBe('urltest');
    });

    it('select maps to selector with its own members, but is NOT injected into Node Select', async () => {
        const app = createApp();
        const res = await app.request(url('/singbox', {
            selectedRules: ['Non-China'],
            customProxyGroups: [{ name: 'Pick', type: 'select', proxies: ['Node Select'] }],
        }));
        const json = JSON.parse(await res.text());
        const node = json.outbounds.find(o => o.tag === '🚀 Node Select');
        const pick = json.outbounds.find(o => o.tag === 'Pick');
        expect(pick.type).toBe('selector');
        expect(pick.outbounds).toContain('🚀 Node Select'); // Pick's own chosen member
        expect(node.outbounds).not.toContain('Pick');         // not auto-listed in Node Select
    });
});

describe('Surge custom proxy groups', () => {
    it('emits a url-test line with matched nodes and url/interval; degrades load-balance to url-test', async () => {
        const app = createApp();
        const res = await app.request(url('/surge', {
            selectedRules: ['Non-China'],
            customProxyGroups: [
                { name: 'HK Auto', type: 'url-test', filter: 'HK' },
                { name: 'LB', type: 'load-balance', filter: 'US' },
            ],
        }));
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toMatch(/^HK Auto = url-test,.*HK-1.*HK-2.*url=http:\/\/www\.gstatic\.com\/generate_204, interval=300/m);
        expect(text).not.toMatch(/^HK Auto = url-test,.*US-1/m);
        expect(text).toMatch(/^LB = url-test,/m); // load-balance degraded
    });

    it('emits the select line but does NOT inject the group into Node Select options', async () => {
        const app = createApp();
        const res = await app.request(url('/surge', {
            selectedRules: ['Non-China'],
            customProxyGroups: [{ name: 'Pick', type: 'select', proxies: ['Node Select'] }],
        }));
        const text = await res.text();
        expect(text).toMatch(/^Pick = select,/m); // the group itself is emitted
        const ns = text.split('\n').find(l => l.startsWith('🚀 Node Select = '));
        expect(ns).toBeTruthy();
        expect(ns).not.toContain('Pick'); // not auto-listed in Node Select
    });
});
