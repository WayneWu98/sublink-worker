import { generateWebPath } from '../utils.js';
import { MissingDependencyError } from './errors.js';

export class ShortLinkService {
    constructor(kv, options = {}) {
        this.kv = kv;
        this.options = options;
    }

    ensureKv() {
        if (!this.kv) {
            throw new MissingDependencyError('Short link service requires a KV store');
        }
        return this.kv;
    }

    generateToken() {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }

    parseStoredValue(raw) {
        if (raw === null || raw === undefined || raw === '') return null;
        if (typeof raw !== 'string') return null;
        if (raw[0] === '{') {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && typeof parsed.q === 'string' && typeof parsed.t === 'string') {
                    return { q: parsed.q, t: parsed.t, legacy: false };
                }
            } catch (_) { /* fall through to legacy */ }
            return { q: raw, t: null, legacy: true };
        }
        return { q: raw, t: null, legacy: true };
    }

    serialize(q, t) {
        return JSON.stringify({ q, t });
    }

    async createShortLink(queryString, providedCode, providedToken) {
        const kv = this.ensureKv();
        const code = providedCode || generateWebPath();
        const existingRaw = await kv.get(code);
        const existing = this.parseStoredValue(existingRaw);

        // Case: fresh create (no existing entry)
        if (existing === null) {
            const token = this.generateToken();
            await this.writeEntry(code, queryString, token);
            return { code, token };
        }

        // Existing new-format entry: verify token
        if (!existing.legacy) {
            if (providedToken && providedToken === existing.t) {
                await this.writeEntry(code, queryString, existing.t);
                return { code, token: existing.t };
            }
            // Mismatch cases implemented in Task 6
            throw new Error('unreachable — token mismatch handling not yet implemented');
        }

        // Legacy-claim branch implemented in Task 7
        throw new Error('unreachable — legacy claim not yet implemented');
    }

    async writeEntry(code, queryString, token) {
        const kv = this.ensureKv();
        const ttl = this.options.shortLinkTtlSeconds;
        const putOptions = ttl ? { expirationTtl: ttl } : undefined;
        await kv.put(code, this.serialize(queryString, token), putOptions);
    }

    async resolveShortCode(code) {
        const kv = this.ensureKv();
        return kv.get(code);
    }
}
