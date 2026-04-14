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

describe('ShortLinkService.createShortLink — fresh create', () => {
    it('generates code+token and stores new-format JSON when no shortCode given', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        const result = await svc.createShortLink('?url=abc', null, null);
        expect(result).toHaveProperty('code');
        expect(result).toHaveProperty('token');
        expect(result.code).toMatch(/^[A-Za-z0-9]{7}$/);
        expect(result.token).toMatch(/^[0-9a-f]{32}$/);
        const stored = await kv.get(result.code);
        expect(JSON.parse(stored)).toEqual({ q: '?url=abc', t: result.token });
    });

    it('accepts a fresh custom shortCode', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        const result = await svc.createShortLink('?url=abc', 'foo', null);
        expect(result.code).toBe('foo');
        expect(result.token).toMatch(/^[0-9a-f]{32}$/);
        const stored = await kv.get('foo');
        expect(JSON.parse(stored)).toEqual({ q: '?url=abc', t: result.token });
    });
});
