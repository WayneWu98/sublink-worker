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
