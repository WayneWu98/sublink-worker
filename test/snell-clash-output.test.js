import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';

function buildClash(input) {
    const builder = new ClashConfigBuilder(input, 'minimal', [], null, 'zh-CN', null, false);
    return builder.build();
}

describe('ClashConfigBuilder — snell output', () => {
    it('emits a Mihomo-shaped Snell node with obfs-opts', async () => {
        const input = `snell://hello@1.2.3.4:443?version=4&obfs=http&obfs-host=bing.com&tfo=true&reuse=true&udp=true#MyNode`;
        const result = await buildClash(input);
        const cfg = yaml.load(result);
        const node = cfg.proxies.find(p => p.name === 'MyNode');
        expect(node).toBeDefined();
        expect(node).toMatchObject({
            name: 'MyNode',
            type: 'snell',
            server: '1.2.3.4',
            port: 443,
            psk: 'hello',
            version: 4,
            udp: true,
            tfo: true,
            reuse: true,
            'obfs-opts': { mode: 'http', host: 'bing.com' }
        });
    });

    it('omits all optional fields for a minimal Snell node', async () => {
        const input = `snell://abc@host:443#Plain`;
        const result = await buildClash(input);
        const cfg = yaml.load(result);
        const node = cfg.proxies.find(p => p.name === 'Plain');
        expect(node).toEqual({
            name: 'Plain',
            type: 'snell',
            server: 'host',
            port: 443,
            psk: 'abc'
        });
    });

    it('emits obfs-opts without host when only mode is provided', async () => {
        const input = `snell://abc@host:443?obfs=tls#X`;
        const result = await buildClash(input);
        const cfg = yaml.load(result);
        const node = cfg.proxies.find(p => p.name === 'X');
        expect(node['obfs-opts']).toEqual({ mode: 'tls' });
    });

    it('Snell node is present in proxy-groups', async () => {
        const input = `snell://abc@host:443#NodeA`;
        const result = await buildClash(input);
        const cfg = yaml.load(result);
        const allGroupMembers = (cfg['proxy-groups'] || []).flatMap(g => g.proxies || []);
        expect(allGroupMembers).toContain('NodeA');
    });
});
