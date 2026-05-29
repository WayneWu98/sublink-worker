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

// A custom proxy group and a custom rule may intentionally share a name: the group
// DEFINES the policy (its members), the rule ROUTES traffic to it. The explicit group
// must win the name over the auto rule-group that would otherwise be generated.
describe('custom proxy group named like a custom rule defines the group', () => {
    it('Surge: a device-only group keeps its DEVICE member instead of the auto full-node list', async () => {
        const app = createApp();
        const res = await app.request(url('/surge', {
            selectedRules: ['Non-China'],
            customRules: [{ name: 'Ponte MacMini', domain_suffix: 'macmini.ponte' }],
            customProxyGroups: [{ name: 'Ponte MacMini', type: 'select', proxies: ['DEVICE:macmini'] }],
        }));
        const text = await res.text();
        // The group is the user-defined device group, NOT the auto Node-Select/proxy list.
        expect(text).toMatch(/^Ponte MacMini = select, DEVICE:macmini$/m);
        // Exactly one "Ponte MacMini =" group line (no shadow/duplicate).
        expect(text.split('\n').filter(l => /^Ponte MacMini = /.test(l))).toHaveLength(1);
        // The custom rule routes to it.
        expect(text).toContain('DOMAIN-SUFFIX,macmini.ponte,Ponte MacMini');
        // The custom group is NOT auto-listed as a member of any other policy group.
        text.split('\n')
            .filter(l => /=\s*(select|url-test),/.test(l) && !l.startsWith('Ponte MacMini = '))
            .forEach(l => expect(l).not.toContain('Ponte MacMini'));
    });

    it('Clash: a device-only group is empty, so the same-named custom rule still forms its selector (no DEVICE leak)', async () => {
        const app = createApp();
        const res = await app.request(url('/clash', {
            selectedRules: ['Non-China'],
            customRules: [{ name: 'Ponte MacMini', domain_suffix: 'macmini.ponte' }],
            customProxyGroups: [{ name: 'Ponte MacMini', type: 'select', proxies: ['DEVICE:macmini'] }],
        }));
        const yaml = await res.text();
        expect(yaml).toContain('name: Ponte MacMini'); // routable group still exists
        expect(yaml).not.toContain('DEVICE:macmini');   // device never leaks to Clash
        expect(yaml).toContain('DOMAIN-SUFFIX,macmini.ponte,Ponte MacMini');
    });

    it('Surge: a non-device group defines explicit members instead of the auto full-node list', async () => {
        const app = createApp();
        const res = await app.request(url('/surge', {
            selectedRules: ['Non-China'],
            customRules: [{ name: 'Combo', domain: 'combo.example' }],
            customProxyGroups: [{ name: 'Combo', type: 'select', proxies: ['Node Select', 'DIRECT'] }],
        }));
        const text = await res.text();
        const comboLine = text.split('\n').find(l => l.startsWith('Combo = '));
        expect(comboLine).toBeTruthy();
        expect(comboLine).toContain('DIRECT');
        expect(comboLine).not.toContain('HK-1'); // not the auto full-node rule-group list
        expect(comboLine).not.toContain('US-1');
        expect(text).toContain('DOMAIN,combo.example,Combo');
    });
});
