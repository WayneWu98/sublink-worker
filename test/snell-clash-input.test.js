import { describe, it, expect } from 'vitest';
import { convertYamlProxyToObject } from '../src/parsers/convertYamlProxyToObject.js';

describe('convertYamlProxyToObject — snell', () => {
    it('parses a full Snell node with obfs-opts', () => {
        const p = {
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
        };
        expect(convertYamlProxyToObject(p)).toEqual({
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

    it('parses a minimal Snell node', () => {
        const p = { name: 'X', type: 'snell', server: 'h', port: 443, psk: 'a' };
        expect(convertYamlProxyToObject(p)).toEqual({
            tag: 'X',
            type: 'snell',
            server: 'h',
            server_port: 443,
            psk: 'a',
            version: undefined,
            tcp_fast_open: undefined,
            reuse: undefined,
            udp: undefined,
            obfs: undefined
        });
    });

    it('omits obfs when obfs-opts is missing', () => {
        const p = { name: 'X', type: 'snell', server: 'h', port: 443, psk: 'a', version: 2 };
        expect(convertYamlProxyToObject(p).obfs).toBeUndefined();
    });
});
