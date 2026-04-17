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

describe('ShortLinkService.createShortLink — overwrite with correct token', () => {
    it('overwrites the query string and keeps the same token', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        const first = await svc.createShortLink('?url=v1', 'foo', null);
        const second = await svc.createShortLink('?url=v2', 'foo', first.token);
        expect(second.code).toBe('foo');
        expect(second.token).toBe(first.token);
        const stored = JSON.parse(await kv.get('foo'));
        expect(stored).toEqual({ q: '?url=v2', t: first.token });
    });
});

describe('ShortLinkService.createShortLink — overwrite auth failures', () => {
    it('throws TokenMismatchError(reason=missing) when no token provided', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        const first = await svc.createShortLink('?url=v1', 'foo', null);
        await expect(svc.createShortLink('?url=v2', 'foo', null))
            .rejects.toMatchObject({ name: 'TokenMismatchError', reason: 'missing', status: 403 });
        const stored = JSON.parse(await kv.get('foo'));
        expect(stored).toEqual({ q: '?url=v1', t: first.token });
    });

    it('throws TokenMismatchError(reason=mismatch) when wrong token provided', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        await svc.createShortLink('?url=v1', 'foo', null);
        await expect(svc.createShortLink('?url=v2', 'foo', 'not-the-token'))
            .rejects.toMatchObject({ name: 'TokenMismatchError', reason: 'mismatch', status: 403 });
    });

    it('throws TokenMismatchError(reason=missing) for empty-string token', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        await svc.createShortLink('?url=v1', 'foo', null);
        await expect(svc.createShortLink('?url=v2', 'foo', ''))
            .rejects.toMatchObject({ name: 'TokenMismatchError', reason: 'missing' });
    });
});

describe('ShortLinkService.createShortLink — legacy claim', () => {
    it('upgrades a legacy (tokenless) entry with a fresh token regardless of input token', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('foo', '?legacy=yes');
        const svc = new ShortLinkService(kv);
        const result = await svc.createShortLink('?url=new', 'foo', null);
        expect(result.code).toBe('foo');
        expect(result.token).toMatch(/^[0-9a-f]{32}$/);
        const stored = JSON.parse(await kv.get('foo'));
        expect(stored).toEqual({ q: '?url=new', t: result.token });
    });

    it('claim ignores any provided token (legacy has no token to match)', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('foo', '?legacy=yes');
        const svc = new ShortLinkService(kv);
        const result = await svc.createShortLink('?url=new', 'foo', 'random-input');
        expect(result.token).not.toBe('random-input');
    });
});

describe('ShortLinkService.resolveShortCode', () => {
    it('returns the raw query string for legacy entries', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('foo', '?legacy=1');
        const svc = new ShortLinkService(kv);
        expect(await svc.resolveShortCode('foo')).toBe('?legacy=1');
    });

    it('returns the query string for new-format entries (strips JSON wrapper)', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        await svc.createShortLink('?url=v1', 'foo', null);
        expect(await svc.resolveShortCode('foo')).toBe('?url=v1');
    });

    it('returns null for missing entries', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        expect(await svc.resolveShortCode('does-not-exist')).toBeNull();
    });
});

describe('ShortLinkService.resolveShortCodeEntry', () => {
    it('returns null for missing entries', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        expect(await svc.resolveShortCodeEntry('nope')).toBeNull();
    });

    it('returns { q, t: null, legacy: true } for legacy entries', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('foo', '?legacy=1');
        const svc = new ShortLinkService(kv);
        expect(await svc.resolveShortCodeEntry('foo')).toEqual({ q: '?legacy=1', t: null, legacy: true });
    });

    it('returns { q, t, legacy: false } for new-format entries', async () => {
        const kv = new MemoryKVAdapter();
        const svc = new ShortLinkService(kv);
        const created = await svc.createShortLink('?url=v1', 'foo', null);
        expect(await svc.resolveShortCodeEntry('foo')).toEqual({
            q: '?url=v1',
            t: created.token,
            legacy: false
        });
    });
});
