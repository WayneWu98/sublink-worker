import { describe, it, expect } from 'vitest';
import { TokenMismatchError } from '../src/services/errors.js';
import { ShortLinkService } from '../src/services/shortLinkService.js';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

describe('TokenMismatchError', () => {
    it('is a 403 error carrying a reason', () => {
        const err = new TokenMismatchError('token required', 'missing');
        expect(err.status).toBe(403);
        expect(err.reason).toBe('missing');
        expect(err.message).toBe('token required');
        expect(err.name).toBe('TokenMismatchError');
    });
});

describe('ShortLinkService.generateToken', () => {
    it('returns a 32-char hex string of cryptographic randomness', () => {
        const svc = new ShortLinkService(new MemoryKVAdapter());
        const a = svc.generateToken();
        const b = svc.generateToken();
        expect(a).toMatch(/^[0-9a-f]{32}$/);
        expect(b).toMatch(/^[0-9a-f]{32}$/);
        expect(a).not.toBe(b);
    });
});

describe('ShortLinkService.parseStoredValue', () => {
    const svc = new ShortLinkService(new MemoryKVAdapter());

    it('returns null for null/undefined/empty', () => {
        expect(svc.parseStoredValue(null)).toBeNull();
        expect(svc.parseStoredValue(undefined)).toBeNull();
        expect(svc.parseStoredValue('')).toBeNull();
    });

    it('treats a raw query string (starts with ?) as legacy, no token', () => {
        expect(svc.parseStoredValue('?config=abc')).toEqual({ q: '?config=abc', t: null, legacy: true });
    });

    it('parses new-format JSON into { q, t }', () => {
        const raw = JSON.stringify({ q: '?x=1', t: 'abc' });
        expect(svc.parseStoredValue(raw)).toEqual({ q: '?x=1', t: 'abc', legacy: false });
    });

    it('treats malformed JSON starting with { as legacy (defensive)', () => {
        expect(svc.parseStoredValue('{not-json')).toEqual({ q: '{not-json', t: null, legacy: true });
    });
});

describe('ShortLinkService.serialize', () => {
    const svc = new ShortLinkService(new MemoryKVAdapter());

    it('stores q and t as a JSON object', () => {
        expect(svc.serialize('?x=1', 'abc')).toBe(JSON.stringify({ q: '?x=1', t: 'abc' }));
    });
});
