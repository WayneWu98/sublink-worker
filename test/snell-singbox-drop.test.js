import { describe, it, expect, vi } from 'vitest';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';

function buildSingbox(input) {
    const builder = new SingboxConfigBuilder(input, 'minimal', [], null, 'zh-CN', null, false);
    return builder.build();
}

describe('SingboxConfigBuilder — snell drop', () => {
    it('does not emit a snell outbound', async () => {
        const input = `snell://abc@host:443?version=4#NodeA`;
        const built = await buildSingbox(input);
        const cfg = typeof built === 'string' ? JSON.parse(built) : built;
        const snellEntries = cfg.outbounds.filter(o => o.type === 'snell');
        expect(snellEntries).toEqual([]);
    });

    it('does not include the snell tag in any outbound or selector group', async () => {
        const input = `snell://abc@host:443#DroppedTag`;
        const built = await buildSingbox(input);
        const cfg = typeof built === 'string' ? JSON.parse(built) : built;
        expect(cfg.outbounds.some(o => o.tag === 'DroppedTag')).toBe(false);
        for (const o of cfg.outbounds) {
            if (Array.isArray(o.outbounds)) {
                expect(o.outbounds).not.toContain('DroppedTag');
            }
        }
    });

    it('warns to console with the dropped node tag', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await buildSingbox(`snell://abc@host:443#WarnTag`);
            const matched = warnSpy.mock.calls.some(args =>
                String(args[0] ?? '').includes('Snell') &&
                String(args.join(' ')).includes('WarnTag')
            );
            expect(matched).toBe(true);
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('keeps non-snell nodes when snell is mixed in', async () => {
        const input = `ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@1.2.3.4:443#KeepMe\nsnell://abc@host:443#Drop`;
        const built = await buildSingbox(input);
        const cfg = typeof built === 'string' ? JSON.parse(built) : built;
        expect(cfg.outbounds.some(o => o.tag === 'KeepMe')).toBe(true);
        expect(cfg.outbounds.some(o => o.tag === 'Drop')).toBe(false);
    });
});
