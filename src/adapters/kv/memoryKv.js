// In-process KV store with TTL support.
//
// Uses absolute expiration timestamps and a lazy check on get() rather than
// setTimeout, which silently downgrades durations >= 2^31 ms (~24.85 days)
// to 1ms in Node.js — the worker would emit `TimeoutOverflowWarning` and
// then immediately delete a value the caller had just put. This bit
// configStorage real-world: docker-compose ships CONFIG_TTL_SECONDS=2592000
// (30 days) by default, which made every saved Surge base config disappear
// before the next request could read it.
export class MemoryKVAdapter {
    constructor() {
        this.store = new Map();
        this.expirations = new Map();
    }

    async get(key) {
        if (this.isExpired(key)) {
            this.store.delete(key);
            this.expirations.delete(key);
            return null;
        }
        return this.store.has(key) ? this.store.get(key) : null;
    }

    async put(key, value, options = {}) {
        this.store.set(key, value);
        if (options.expirationTtl) {
            const expiresAt = Date.now() + options.expirationTtl * 1000;
            this.expirations.set(key, expiresAt);
        } else {
            this.expirations.delete(key);
        }
    }

    async delete(key) {
        this.store.delete(key);
        this.expirations.delete(key);
    }

    isExpired(key) {
        const expiresAt = this.expirations.get(key);
        return typeof expiresAt === 'number' && Date.now() >= expiresAt;
    }
}
