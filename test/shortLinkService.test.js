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
