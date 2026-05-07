import { describe, it, expect } from 'vitest';
import { convertSurgeProxyToObject } from '../src/parsers/convertSurgeProxyToObject.js';

describe('convertSurgeProxyToObject — snell', () => {
    it('parses a full Snell line', () => {
        const line = 'MyNode = snell, 1.2.3.4, 443, psk=hello, version=4, obfs=http, obfs-host=bing.com, tfo=true, reuse=true';
        expect(convertSurgeProxyToObject(line)).toEqual({
            tag: 'MyNode',
            type: 'snell',
            server: '1.2.3.4',
            server_port: 443,
            psk: 'hello',
            version: 4,
            tcp_fast_open: true,
            reuse: true,
            obfs: { type: 'http', host: 'bing.com' }
        });
    });

    it('parses a minimal Snell line (psk only)', () => {
        const line = 'X = snell, host, 443, psk=abc';
        expect(convertSurgeProxyToObject(line)).toEqual({
            tag: 'X',
            type: 'snell',
            server: 'host',
            server_port: 443,
            psk: 'abc',
            version: undefined,
            tcp_fast_open: undefined,
            reuse: undefined,
            obfs: undefined
        });
    });

    it('parses obfs=tls without obfs-host', () => {
        const line = 'X = snell, host, 443, psk=abc, obfs=tls';
        const result = convertSurgeProxyToObject(line);
        expect(result.obfs).toEqual({ type: 'tls', host: undefined });
    });

    it('does not set udp (Surge has no Snell UDP toggle)', () => {
        const result = convertSurgeProxyToObject('X = snell, host, 443, psk=abc');
        expect(result.udp).toBeUndefined();
    });
});
