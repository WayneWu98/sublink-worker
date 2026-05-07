import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';

const MIXED_INPUT = [
    'ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@1.2.3.4:443#SS-Node',
    'snell://hello@5.6.7.8:443?version=4&obfs=http&obfs-host=bing.com#Snell-Node',
    'trojan://pwd@9.10.11.12:443?sni=example.com#Trojan-Node'
].join('\n');

describe('Snell end-to-end (mixed input → all outputs)', () => {
    it('Surge output contains all three nodes including Snell', async () => {
        const builder = new SurgeConfigBuilder(MIXED_INPUT, 'minimal', [], null, 'zh-CN', null, false);
        const out = await builder.build();
        const proxySection = out.match(/\[Proxy\]([\s\S]*?)(?=\n\[)/)[1];
        expect(proxySection).toContain('SS-Node');
        expect(proxySection).toMatch(/Snell-Node\s*=\s*snell,/);
        expect(proxySection).toContain('Trojan-Node');
    });

    it('Clash output contains all three nodes with native Snell shape', async () => {
        const builder = new ClashConfigBuilder(MIXED_INPUT, 'minimal', [], null, 'zh-CN', null, false);
        const cfg = yaml.load(await builder.build());
        const names = cfg.proxies.map(p => p.name).sort();
        expect(names).toEqual(['SS-Node', 'Snell-Node', 'Trojan-Node']);
        const snell = cfg.proxies.find(p => p.name === 'Snell-Node');
        expect(snell.type).toBe('snell');
        expect(snell['obfs-opts']).toEqual({ mode: 'http', host: 'bing.com' });
    });

    it('Sing-Box output contains the two non-Snell nodes only', async () => {
        const builder = new SingboxConfigBuilder(MIXED_INPUT, 'minimal', [], null, 'zh-CN', null, false);
        const built = await builder.build();
        const cfg = typeof built === 'string' ? JSON.parse(built) : built;
        const tags = cfg.outbounds.filter(o => o.server).map(o => o.tag).sort();
        expect(tags).toEqual(['SS-Node', 'Trojan-Node']);
    });
});
