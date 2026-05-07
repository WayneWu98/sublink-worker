import { describe, it, expect, vi } from 'vitest';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

describe('MemoryKVAdapter', () => {
    it('returns stored values before expiration', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('key', 'value', { expirationTtl: 60 });
        expect(await kv.get('key')).toBe('value');
    });

    it('returns null after the TTL has elapsed', async () => {
        vi.useFakeTimers();
        try {
            const kv = new MemoryKVAdapter();
            await kv.put('key', 'value', { expirationTtl: 60 });
            vi.advanceTimersByTime(61_000);
            expect(await kv.get('key')).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('handles TTLs longer than the Node setTimeout 32-bit limit (~24.85 days)', async () => {
        // Regression: previously used setTimeout(fn, ttlSeconds * 1000) which
        // silently downgrades to 1ms when the duration exceeds 2^31 ms.
        // 30 days = 2,592,000s = 2,592,000,000ms — well past the limit.
        const kv = new MemoryKVAdapter();
        const thirtyDaysSec = 60 * 60 * 24 * 30;
        await kv.put('key', 'value', { expirationTtl: thirtyDaysSec });
        // Without the fix this would return null on the next event-loop tick.
        await new Promise(resolve => setImmediate(resolve));
        expect(await kv.get('key')).toBe('value');
    });

    it('overwriting clears any prior expiration', async () => {
        vi.useFakeTimers();
        try {
            const kv = new MemoryKVAdapter();
            await kv.put('key', 'first', { expirationTtl: 5 });
            await kv.put('key', 'second'); // no TTL
            vi.advanceTimersByTime(10_000);
            expect(await kv.get('key')).toBe('second');
        } finally {
            vi.useRealTimers();
        }
    });

    it('delete() removes both value and expiration', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('key', 'value', { expirationTtl: 60 });
        await kv.delete('key');
        expect(await kv.get('key')).toBeNull();
    });
});
