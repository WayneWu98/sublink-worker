import { RESERVED_OUTBOUNDS } from '../BaseConfigBuilder.js';
import { uniqueNames } from './groupBuilder.js';

const VALID_TYPES = new Set(['select', 'url-test', 'fallback', 'load-balance']);

// Native group type per platform for each requested type.
// sing-box only has selector/urltest; Surge has no load-balance.
const TYPE_MAP = {
    clash:   { 'select': 'select',   'url-test': 'url-test', 'fallback': 'fallback', 'load-balance': 'load-balance' },
    singbox: { 'select': 'selector', 'url-test': 'urltest',  'fallback': 'urltest',  'load-balance': 'urltest' },
    surge:   { 'select': 'select',   'url-test': 'url-test', 'fallback': 'fallback', 'load-balance': 'url-test' },
};

const DEFAULT_TEST_URL = 'http://www.gstatic.com/generate_204';

export function mapGroupType(userType, platform) {
    const t = VALID_TYPES.has(userType) ? userType : 'select';
    return TYPE_MAP[platform][t];
}

// True iff the native type auto-tests members (needs url/interval); false for plain select/selector.
export function isAutoType(nativeType) {
    return nativeType === 'url-test' || nativeType === 'urltest'
        || nativeType === 'fallback' || nativeType === 'load-balance';
}

function safeRegExp(pattern) {
    if (typeof pattern !== 'string' || pattern.trim() === '') return null;
    try { return new RegExp(pattern); } catch { return null; }
}

// Validate + dedup raw user input into clean descriptors. `existingNames` are
// names already taken by other (built-in/rule/ruleset) groups, to avoid collisions.
export function sanitizeCustomProxyGroups(rawGroups, existingNames = []) {
    const seen = new Set(
        (existingNames || []).map(n => (typeof n === 'string' ? n.trim() : n)).filter(Boolean)
    );
    const out = [];
    (Array.isArray(rawGroups) ? rawGroups : []).forEach(g => {
        if (!g || typeof g !== 'object') return;
        const name = typeof g.name === 'string' ? g.name.trim() : '';
        if (!name) return;
        if (RESERVED_OUTBOUNDS.has(name.toUpperCase())) return;
        if (name.startsWith('DEVICE:')) return;
        if (seen.has(name)) return;
        seen.add(name);
        out.push({
            name,
            type: VALID_TYPES.has(g.type) ? g.type : 'select',
            filter: typeof g.filter === 'string' ? g.filter : '',
            excludeFilter: typeof g.excludeFilter === 'string' ? g.excludeFilter : '',
            proxies: Array.isArray(g.proxies) ? g.proxies.filter(p => typeof p === 'string') : [],
            testUrl: (typeof g.testUrl === 'string' && g.testUrl) ? g.testUrl : DEFAULT_TEST_URL,
            interval: Number.isFinite(g.interval) ? g.interval : 300,
        });
    });
    return out;
}

// Resolve a group's final member list. `resolveRef(raw)` maps a raw reference to
// its emitted (possibly translated) name; `validRefSet` is the set of acceptable
// resolved member names (real proxies + emitted group names + DIRECT/REJECT).
export function resolveCustomProxyGroupMembers(group, { proxyList = [], resolveRef, validRefSet }) {
    const filterRe = safeRegExp(group.filter);
    const excludeRe = safeRegExp(group.excludeFilter);
    const matched = filterRe
        ? proxyList.filter(n => filterRe.test(n) && !(excludeRe && excludeRe.test(n)))
        : [];
    const refs = [];
    (group.proxies || []).forEach(raw => {
        const resolved = resolveRef ? resolveRef(raw) : raw;
        if (!resolved) return;
        if (resolved === group.name) return;                       // drop self-reference
        // DEVICE:xxx are self-valid Surge (Ponte) policy literals. Builders that
        // don't support them (Clash/sing-box) return null from resolveRef, so a
        // device only reaches here on Surge — bypass the validRefSet membership check.
        const isDevice = typeof resolved === 'string' && resolved.startsWith('DEVICE:');
        if (!isDevice && validRefSet && !validRefSet.has(resolved)) return; // drop invalid reference
        refs.push(resolved);
    });
    const members = uniqueNames([...matched, ...refs]);
    return { members, empty: members.length === 0 };
}
