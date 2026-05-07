import { describe, it, expect, vi } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

const createTestApp = (overrides = {}) => {
    const runtime = {
        kv: overrides.kv ?? new MemoryKVAdapter(),
        assetFetcher: overrides.assetFetcher ?? null,
        logger: console,
        config: {
            configTtlSeconds: 60,
            shortLinkTtlSeconds: null,
            ...(overrides.config || {})
        }
    };
    return createApp(runtime);
};

describe('Worker', () => {
    it('GET / returns HTML', async () => {
        const app = createTestApp();
        const res = await app.request('http://localhost/');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
        const text = await res.text();
        expect(text).toContain('Sublink Worker');
    });

    it('GET /singbox returns JSON', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const json = await res.json();
        expect(json).toHaveProperty('outbounds');
    });

    it('GET /singbox returns legacy config for sing-box 1.11 UA', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}`, {
            headers: {
                'User-Agent': 'SFI/1.12.2 (Build 2; sing-box 1.11.4; language zh_CN)'
            }
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json?.dns?.servers?.[0]).toHaveProperty('address');
        expect(json?.dns?.servers?.[0]).not.toHaveProperty('type');
        expect(json?.route).not.toHaveProperty('default_domain_resolver');
    });

    it('GET /singbox returns 1.12+ config for sing-box 1.12 UA', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}`, {
            headers: {
                'User-Agent': 'SFA/1.12.12 (587; sing-box 1.12.12; language zh_Hans_CN)'
            }
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json?.dns?.servers?.[0]).toHaveProperty('type');
        expect(json?.dns?.servers?.[0]).not.toHaveProperty('address');
        expect(json?.route).toHaveProperty('default_domain_resolver', 'dns_resolver');
    });

    it('GET /clash returns YAML', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}`);
        expect(res.status).toBe(200);
        // Clash builder returns text/yaml
        expect(res.headers.get('content-type')).toContain('text/yaml');
        const text = await res.text();
        expect(text).toContain('proxies:');
    });

    it('GET /clash rejects empty url-test proxy groups with a diagnostic error', async () => {
        const app = createTestApp();
        const config = `
proxies:
  - name: Node-A
    type: ss
    server: a.example.com
    port: 443
    cipher: aes-128-gcm
    password: test
proxy-groups:
  - name: Empty Test Group
    type: url-test
    proxies: []
`;
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}`);

        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toContain('Empty Test Group');
        expect(text).toContain('url-test');
    });

    it('GET /shorten-v2 returns JSON with code on success', async () => {
        const app = createTestApp();
        const url = 'http://example.com';
        const res = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json();
        expect(body.code).toBeTruthy();
        expect(body.token).toBeTruthy();
    });

    it('GET /shorten-v2 returns JSON { code, token } for fresh create', async () => {
        const app = createTestApp();
        const url = 'http://example.com/clash?config=abc';
        const res = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json();
        expect(body.code).toMatch(/^[A-Za-z0-9]{7}$/);
        expect(body.token).toMatch(/^[0-9a-f]{32}$/);
    });

    it('GET /shorten-v2 with custom shortCode (fresh) returns that code + token', async () => {
        const app = createTestApp();
        const url = 'http://example.com/clash?config=abc';
        const res = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}&shortCode=mycode`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.code).toBe('mycode');
        expect(body.token).toMatch(/^[0-9a-f]{32}$/);
    });

    it('GET /shorten-v2 overwriting existing code without token returns 403', async () => {
        const app = createTestApp();
        const url = 'http://example.com/clash?config=abc';
        const r1 = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}&shortCode=mycode`);
        const token = (await r1.json()).token;
        expect(token).toBeTruthy();
        const r2 = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url + '2')}&shortCode=mycode`);
        expect(r2.status).toBe(403);
        const body = await r2.json();
        expect(body.error).toBeTruthy();
        expect(body.reason).toBe('missing');
    });

    it('GET /shorten-v2 overwriting with wrong token returns 403', async () => {
        const app = createTestApp();
        const url = 'http://example.com/clash?config=abc';
        await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}&shortCode=mycode`);
        const r2 = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url + '2')}&shortCode=mycode`, {
            headers: { 'X-Shortlink-Token': 'nope' }
        });
        expect(r2.status).toBe(403);
        const body = await r2.json();
        expect(body.reason).toBe('mismatch');
    });

    it('GET /shorten-v2 overwriting with correct token succeeds and keeps token stable', async () => {
        const app = createTestApp();
        const url = 'http://example.com/clash?config=abc';
        const r1 = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}&shortCode=mycode`);
        const token = (await r1.json()).token;
        const r2 = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url + '2')}&shortCode=mycode`, {
            headers: { 'X-Shortlink-Token': token }
        });
        expect(r2.status).toBe(200);
        const body = await r2.json();
        expect(body.code).toBe('mycode');
        expect(body.token).toBe(token);
    });

    it('GET /shorten-v2 claiming a legacy entry returns a fresh token', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('legacycode', '?legacy=1');
        const app = createTestApp({ kv });
        const url = 'http://example.com/clash?config=abc';
        const res = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}&shortCode=legacycode`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.code).toBe('legacycode');
        expect(body.token).toMatch(/^[0-9a-f]{32}$/);
    });

    it('GET /b/:code still redirects for both legacy and new-format entries', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('legacy1', '?config=abc');
        const app = createTestApp({ kv });
        const r1 = await app.request(`http://localhost/shorten-v2?url=http%3A%2F%2Fx.test%2Fsingbox%3Fconfig%3Ddef&shortCode=new1`);
        expect(r1.status).toBe(200);

        const res1 = await app.request('http://localhost/b/legacy1');
        expect(res1.status).toBe(302);
        expect(res1.headers.get('location')).toBe('http://localhost/singbox?config=abc');

        const res2 = await app.request('http://localhost/b/new1');
        expect(res2.status).toBe(302);
        expect(res2.headers.get('location')).toBe('http://localhost/singbox?config=def');
    });

    it('GET /resolve legacy entry returns originalUrl without token', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('legacy1', '?config=abc');
        const app = createTestApp({ kv });
        const res = await app.request('http://localhost/resolve?url=' + encodeURIComponent('http://localhost/b/legacy1'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.originalUrl).toBe('http://localhost/singbox?config=abc');
    });

    it('GET /resolve legacy entry ignores any provided token', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('legacy1', '?config=abc');
        const app = createTestApp({ kv });
        const res = await app.request('http://localhost/resolve?url=' + encodeURIComponent('http://localhost/b/legacy1'), {
            headers: { 'X-Shortlink-Token': 'anything' }
        });
        expect(res.status).toBe(200);
    });

    it('GET /resolve new-format entry without token returns 401 missing', async () => {
        const app = createTestApp();
        const shorten = await app.request('http://localhost/shorten-v2?url=' + encodeURIComponent('http://localhost/singbox?config=xyz') + '&shortCode=new1');
        expect(shorten.status).toBe(200);
        const res = await app.request('http://localhost/resolve?url=' + encodeURIComponent('http://localhost/b/new1'));
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.reason).toBe('missing');
    });

    it('GET /resolve new-format entry with wrong token returns 403 mismatch', async () => {
        const app = createTestApp();
        await app.request('http://localhost/shorten-v2?url=' + encodeURIComponent('http://localhost/singbox?config=xyz') + '&shortCode=new1');
        const res = await app.request('http://localhost/resolve?url=' + encodeURIComponent('http://localhost/b/new1'), {
            headers: { 'X-Shortlink-Token': 'wrong' }
        });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.reason).toBe('mismatch');
    });

    it('GET /resolve new-format entry with correct token returns originalUrl', async () => {
        const app = createTestApp();
        const r = await app.request('http://localhost/shorten-v2?url=' + encodeURIComponent('http://localhost/singbox?config=xyz') + '&shortCode=new1');
        const { token } = await r.json();
        const res = await app.request('http://localhost/resolve?url=' + encodeURIComponent('http://localhost/b/new1'), {
            headers: { 'X-Shortlink-Token': token }
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.originalUrl).toBe('http://localhost/singbox?config=xyz');
    });

    it('GET /resolve unknown code returns 404', async () => {
        const app = createTestApp();
        const res = await app.request('http://localhost/resolve?url=' + encodeURIComponent('http://localhost/b/nope'));
        expect(res.status).toBe(404);
    });

    it('GET /resolve without url query returns 400', async () => {
        const app = createTestApp();
        const res = await app.request('http://localhost/resolve');
        expect(res.status).toBe(400);
    });
});
