import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

const createTestApp = (overrides = {}) => {
    const runtime = {
        kv: overrides.kv ?? new MemoryKVAdapter(),
        assetFetcher: null,
        logger: console,
        config: {
            configTtlSeconds: 60,
            shortLinkTtlSeconds: null
        }
    };
    return createApp(runtime);
};

const VMESS_CONFIG = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';

const firstManagedConfigUrl = (body) => {
    const line = body.split('\n').find(l => l.startsWith('#!MANAGED-CONFIG'));
    if (!line) return null;
    return line.split(/\s+/)[1];
};

describe('Surge #!MANAGED-CONFIG URL resolution', () => {
    it('direct access without sub_url writes the request URL into MANAGED-CONFIG', async () => {
        const app = createTestApp();
        const res = await app.request(`http://localhost/surge?config=${encodeURIComponent(VMESS_CONFIG)}`);
        expect(res.status).toBe(200);
        const body = await res.text();
        const url = firstManagedConfigUrl(body);
        expect(url).toBe(`http://localhost/surge?config=${encodeURIComponent(VMESS_CONFIG)}`);
    });

    it('direct access with same-origin sub_url writes sub_url into MANAGED-CONFIG', async () => {
        const app = createTestApp();
        const sub = 'http://localhost/s/abc123';
        const res = await app.request(
            `http://localhost/surge?config=${encodeURIComponent(VMESS_CONFIG)}&sub_url=${encodeURIComponent(sub)}`
        );
        expect(res.status).toBe(200);
        const body = await res.text();
        expect(firstManagedConfigUrl(body)).toBe(sub);
    });

    it('direct access with cross-origin sub_url strips it and falls back to request URL', async () => {
        const app = createTestApp();
        const evil = 'https://evil.com/surge';
        const res = await app.request(
            `http://localhost/surge?config=${encodeURIComponent(VMESS_CONFIG)}&sub_url=${encodeURIComponent(evil)}`
        );
        expect(res.status).toBe(200);
        const body = await res.text();
        const url = firstManagedConfigUrl(body);
        expect(url).not.toContain('evil.com');
        expect(url).not.toContain('sub_url');
        expect(url).toContain('http://localhost/surge');
        expect(url).toContain(`config=${encodeURIComponent(VMESS_CONFIG)}`);
    });

    it('direct access with malformed sub_url strips it and falls back', async () => {
        const app = createTestApp();
        const res = await app.request(
            `http://localhost/surge?config=${encodeURIComponent(VMESS_CONFIG)}&sub_url=not-a-url`
        );
        expect(res.status).toBe(200);
        const body = await res.text();
        const url = firstManagedConfigUrl(body);
        expect(url).not.toContain('sub_url');
        expect(url).toContain('http://localhost/surge');
    });

    it('protocol mismatch (https sub_url for http request) is treated as cross-origin', async () => {
        const app = createTestApp();
        const sub = 'https://localhost/s/abc123';
        const res = await app.request(
            `http://localhost/surge?config=${encodeURIComponent(VMESS_CONFIG)}&sub_url=${encodeURIComponent(sub)}`
        );
        expect(res.status).toBe(200);
        const body = await res.text();
        const url = firstManagedConfigUrl(body);
        expect(url).not.toContain('sub_url');
        expect(url).not.toMatch(/^https:/);
    });
});

describe('/s/:code redirect passes short URL via sub_url', () => {
    it('/s/:code redirect Location preserves original params and appends encoded sub_url', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('abc123', '?config=xyz');
        const app = createTestApp({ kv });
        const res = await app.request('http://localhost/s/abc123');
        expect(res.status).toBe(302);
        const loc = res.headers.get('location');
        expect(loc).toBeTruthy();

        const locUrl = new URL(loc);
        expect(locUrl.origin).toBe('http://localhost');
        expect(locUrl.pathname).toBe('/surge');
        expect(locUrl.searchParams.get('config')).toBe('xyz');
        expect(locUrl.searchParams.get('sub_url')).toBe('http://localhost/s/abc123');
    });

    it('/b/:code redirect Location does NOT include sub_url (Singbox out of scope)', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('abc123', '?config=xyz');
        const app = createTestApp({ kv });
        const res = await app.request('http://localhost/b/abc123');
        expect(res.status).toBe(302);
        const loc = res.headers.get('location');
        expect(new URL(loc).searchParams.has('sub_url')).toBe(false);
    });

    it('/c/:code redirect Location does NOT include sub_url', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('abc123', '?config=xyz');
        const app = createTestApp({ kv });
        const res = await app.request('http://localhost/c/abc123');
        expect(res.status).toBe(302);
        expect(new URL(res.headers.get('location')).searchParams.has('sub_url')).toBe(false);
    });

    it('/x/:code redirect Location does NOT include sub_url', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('abc123', '?config=xyz');
        const app = createTestApp({ kv });
        const res = await app.request('http://localhost/x/abc123');
        expect(res.status).toBe(302);
        expect(new URL(res.headers.get('location')).searchParams.has('sub_url')).toBe(false);
    });
});

describe('End-to-end: short link → Surge config → MANAGED-CONFIG short URL', () => {
    it('following the /s/:code redirect yields MANAGED-CONFIG pointing at the short URL', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('abc123', `?config=${encodeURIComponent(VMESS_CONFIG)}`);
        const app = createTestApp({ kv });

        const r1 = await app.request('http://localhost/s/abc123');
        expect(r1.status).toBe(302);
        const location = r1.headers.get('location');
        expect(location).toBeTruthy();

        const r2 = await app.request(location);
        expect(r2.status).toBe(200);
        const body = await r2.text();

        expect(body).toMatch(/^#!MANAGED-CONFIG http:\/\/localhost\/s\/abc123 interval=/m);
        expect(body).not.toMatch(/#!MANAGED-CONFIG http:\/\/localhost\/surge\?/);
    });
});
