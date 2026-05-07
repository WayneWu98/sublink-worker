import { describe, it, expect } from 'vitest';
import { parseSnell } from '../src/parsers/protocols/snellParser.js';

describe('parseSnell', () => {
    it('parses a full snell:// URL with all params', () => {
        const url = 'snell://hello@1.2.3.4:443?version=4&obfs=http&obfs-host=bing.com&tfo=true&reuse=true&udp=true#MyNode';
        const result = parseSnell(url);
        expect(result).toEqual({
            tag: 'MyNode',
            type: 'snell',
            server: '1.2.3.4',
            server_port: 443,
            psk: 'hello',
            version: 4,
            tcp_fast_open: true,
            reuse: true,
            udp: true,
            obfs: { type: 'http', host: 'bing.com' }
        });
    });

    it('parses minimal snell:// URL (psk + host:port only)', () => {
        const result = parseSnell('snell://abc@example.com:443#Plain');
        expect(result).toEqual({
            tag: 'Plain',
            type: 'snell',
            server: 'example.com',
            server_port: 443,
            psk: 'abc',
            version: undefined,
            tcp_fast_open: undefined,
            reuse: undefined,
            udp: undefined,
            obfs: undefined
        });
    });

    it('URL-decodes the psk', () => {
        const result = parseSnell('snell://p%40ss%2Fkey@host:443#N');
        expect(result.psk).toBe('p@ss/key');
    });

    it('omits obfs.host when only obfs is provided', () => {
        const result = parseSnell('snell://abc@host:443?obfs=tls#N');
        expect(result.obfs).toEqual({ type: 'tls', host: undefined });
    });

    it('returns null when missing user-info segment (no psk)', () => {
        expect(parseSnell('snell://host:443#N')).toBeNull();
    });

    it('parses tfo=false correctly', () => {
        const result = parseSnell('snell://abc@host:443?tfo=false#N');
        expect(result.tcp_fast_open).toBe(false);
    });
});

import { ProxyParser } from '../src/parsers/index.js';

describe('ProxyParser routing', () => {
    it('dispatches snell:// to the snell parser', async () => {
        const result = await ProxyParser.parse('snell://abc@example.com:443?version=4#R');
        expect(result).not.toBeUndefined();
        expect(result.type).toBe('snell');
        expect(result.tag).toBe('R');
        expect(result.version).toBe(4);
    });
});
