import { describe, it, expect } from 'vitest';
import { SurgeConfigBuilder } from '../src/builders/SurgeConfigBuilder.js';

describe('SurgeConfigBuilder — snell output', () => {
    it('emits a full Snell line in [Proxy]', async () => {
        const input = `snell://hello@1.2.3.4:443?version=4&obfs=http&obfs-host=bing.com&tfo=true&reuse=true#MyNode`;
        const builder = new SurgeConfigBuilder(input, 'minimal', [], null, 'zh-CN', null, false);
        const result = await builder.build();
        const proxySection = result.match(/\[Proxy\]([\s\S]*?)(?=\n\[)/)[1];
        expect(proxySection).toMatch(/MyNode\s*=\s*snell,\s*1\.2\.3\.4,\s*443,\s*psk=hello/);
        expect(proxySection).toContain('version=4');
        expect(proxySection).toContain('obfs=http');
        expect(proxySection).toContain('obfs-host=bing.com');
        expect(proxySection).toContain('tfo=true');
        expect(proxySection).toContain('reuse=true');
    });

    it('emits minimal Snell line when only psk is provided', async () => {
        const input = `snell://abc@host:443#Plain`;
        const builder = new SurgeConfigBuilder(input, 'minimal', [], null, 'zh-CN', null, false);
        const result = await builder.build();
        const proxySection = result.match(/\[Proxy\]([\s\S]*?)(?=\n\[)/)[1];
        expect(proxySection).toMatch(/Plain\s*=\s*snell,\s*host,\s*443,\s*psk=abc/);
        expect(proxySection).not.toContain('version=');
        expect(proxySection).not.toContain('obfs=');
        expect(proxySection).not.toContain('tfo=');
        expect(proxySection).not.toContain('reuse=');
    });

    it('does NOT emit reuse=false / tfo=false when explicitly false', async () => {
        const input = `snell://abc@host:443?tfo=false&reuse=false#X`;
        const builder = new SurgeConfigBuilder(input, 'minimal', [], null, 'zh-CN', null, false);
        const result = await builder.build();
        const proxySection = result.match(/\[Proxy\]([\s\S]*?)(?=\n\[)/)[1];
        expect(proxySection).not.toContain('tfo=');
        expect(proxySection).not.toContain('reuse=');
    });

    it('Snell node appears in proxy groups (not filtered as comment)', async () => {
        const input = `snell://abc@host:443#NodeA`;
        const builder = new SurgeConfigBuilder(input, 'minimal', [], null, 'zh-CN', null, false);
        const result = await builder.build();
        const groupsSection = result.match(/\[Proxy Group\]([\s\S]*?)(?=\n\[)/)[1];
        expect(groupsSection).toContain('NodeA');
    });
});
