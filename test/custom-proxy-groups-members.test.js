import { describe, it, expect } from 'vitest';
import {
    mapGroupType,
    isAutoType,
    sanitizeCustomProxyGroups,
    resolveCustomProxyGroupMembers,
} from '../src/builders/helpers/customProxyGroups.js';
import {
    buildNodeSelectMembers,
    buildSelectorMembers,
    buildCustomRuleMembers,
} from '../src/builders/helpers/groupBuilder.js';

describe('mapGroupType', () => {
    it('maps every type natively for clash', () => {
        expect(mapGroupType('select', 'clash')).toBe('select');
        expect(mapGroupType('url-test', 'clash')).toBe('url-test');
        expect(mapGroupType('fallback', 'clash')).toBe('fallback');
        expect(mapGroupType('load-balance', 'clash')).toBe('load-balance');
    });
    it('degrades fallback/load-balance to urltest for singbox', () => {
        expect(mapGroupType('select', 'singbox')).toBe('selector');
        expect(mapGroupType('url-test', 'singbox')).toBe('urltest');
        expect(mapGroupType('fallback', 'singbox')).toBe('urltest');
        expect(mapGroupType('load-balance', 'singbox')).toBe('urltest');
    });
    it('degrades load-balance to url-test for surge', () => {
        expect(mapGroupType('fallback', 'surge')).toBe('fallback');
        expect(mapGroupType('load-balance', 'surge')).toBe('url-test');
    });
    it('falls back to select for an unknown type', () => {
        expect(mapGroupType('garbage', 'clash')).toBe('select');
        expect(mapGroupType('garbage', 'singbox')).toBe('selector');
    });
});

describe('isAutoType', () => {
    it('is true for auto native types, false for select/selector', () => {
        expect(isAutoType('url-test')).toBe(true);
        expect(isAutoType('urltest')).toBe(true);
        expect(isAutoType('fallback')).toBe(true);
        expect(isAutoType('load-balance')).toBe(true);
        expect(isAutoType('select')).toBe(false);
        expect(isAutoType('selector')).toBe(false);
    });
});

describe('sanitizeCustomProxyGroups', () => {
    it('keeps valid groups and applies defaults', () => {
        const out = sanitizeCustomProxyGroups([
            { name: 'HK', type: 'url-test', filter: 'HK' },
        ]);
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({
            name: 'HK', type: 'url-test', filter: 'HK',
            excludeFilter: '', proxies: [],
            testUrl: 'http://www.gstatic.com/generate_204', interval: 300,
        });
    });
    it('drops empty names, reserved names, DEVICE: names, and duplicates', () => {
        const out = sanitizeCustomProxyGroups([
            { name: '  ', type: 'select' },
            { name: 'DIRECT', type: 'select' },
            { name: 'DEVICE:iPhone', type: 'select' },
            { name: 'Dup', type: 'select' },
            { name: 'Dup', type: 'url-test' },
        ]);
        expect(out.map(g => g.name)).toEqual(['Dup']);
    });
    it('drops names colliding with existing group names', () => {
        const out = sanitizeCustomProxyGroups([{ name: 'Taken', type: 'select' }], ['Taken']);
        expect(out).toHaveLength(0);
    });
    it('coerces invalid type to select and non-array proxies to []', () => {
        const out = sanitizeCustomProxyGroups([{ name: 'X', type: 'weird', proxies: 'no' }]);
        expect(out[0].type).toBe('select');
        expect(out[0].proxies).toEqual([]);
    });
});

describe('resolveCustomProxyGroupMembers', () => {
    const proxyList = ['HK-1', 'HK-2', 'US-1', 'JP-expired'];
    const identity = (raw) => (raw === 'DIRECT' || raw === 'REJECT') ? raw : raw; // literal resolver
    const validRefSet = new Set([...proxyList, 'Node Select', 'DIRECT', 'REJECT', 'OtherGroup']);

    it('includes filter matches and excludes excludeFilter matches', () => {
        const { members, empty } = resolveCustomProxyGroupMembers(
            { name: 'HK', filter: 'HK|JP', excludeFilter: 'expired', proxies: [] },
            { proxyList, resolveRef: identity, validRefSet });
        expect(members).toEqual(['HK-1', 'HK-2']);
        expect(empty).toBe(false);
    });
    it('resolves valid refs, drops invalid refs and self-references', () => {
        const { members } = resolveCustomProxyGroupMembers(
            { name: 'Sel', filter: '', proxies: ['Node Select', 'Ghost', 'Sel', 'DIRECT'] },
            { proxyList, resolveRef: identity, validRefSet });
        expect(members).toEqual(['Node Select', 'DIRECT']);
    });
    it('reports empty when nothing matches and no valid refs', () => {
        const { members, empty } = resolveCustomProxyGroupMembers(
            { name: 'None', filter: 'NOPE', proxies: ['Ghost'] },
            { proxyList, resolveRef: identity, validRefSet });
        expect(members).toEqual([]);
        expect(empty).toBe(true);
    });
    it('treats an invalid regex as no filter', () => {
        const { members, empty } = resolveCustomProxyGroupMembers(
            { name: 'Bad', filter: '(', proxies: ['DIRECT'] },
            { proxyList, resolveRef: identity, validRefSet });
        expect(members).toEqual(['DIRECT']);
        expect(empty).toBe(false);
    });
});

describe('member builders do NOT inject custom proxy group names', () => {
    const t = (k) => k.startsWith('outboundNames.') ? k.slice('outboundNames.'.length) : k;

    // Custom proxy groups must not be auto-listed as members of the auto-generated
    // groups. The builders ignore any customProxyGroupNames passed to them.
    it('buildNodeSelectMembers omits custom group names', () => {
        const out = buildNodeSelectMembers({
            proxyList: ['N1'], translator: t, includeAutoSelect: true,
            customProxyGroupNames: ['HK Auto'],
        });
        expect(out).not.toContain('HK Auto');
        expect(out).toContain('N1');
    });

    it('buildSelectorMembers and buildCustomRuleMembers omit custom group names', () => {
        const sel = buildSelectorMembers({ proxyList: ['N1'], translator: t, customProxyGroupNames: ['G'] });
        const cr = buildCustomRuleMembers({ proxyList: ['N1'], translator: t, customProxyGroupNames: ['G'] });
        expect(sel).not.toContain('G');
        expect(cr).not.toContain('G');
    });
});
