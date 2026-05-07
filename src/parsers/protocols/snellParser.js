import { parseServerInfo, parseUrlParams, parseBool, parseMaybeNumber } from '../../utils.js';

export function parseSnell(url) {
    const { addressPart, params, name: rawName } = parseUrlParams(url);
    if (!addressPart || !addressPart.includes('@')) return null;

    // parseUrlParams only extracts the fragment when a query string is present.
    // For URLs without `?` (e.g. snell://psk@host:port#name), peel the fragment
    // off addressPart manually.
    let workingAddress = addressPart;
    let name = rawName;
    if (!name && workingAddress.includes('#')) {
        const hashIdx = workingAddress.indexOf('#');
        try {
            name = decodeURIComponent(workingAddress.slice(hashIdx + 1));
        } catch (_) {
            name = workingAddress.slice(hashIdx + 1);
        }
        workingAddress = workingAddress.slice(0, hashIdx);
    }

    const atIndex = workingAddress.lastIndexOf('@');
    const pskPart = workingAddress.slice(0, atIndex);
    const serverInfo = workingAddress.slice(atIndex + 1);
    const { host, port } = parseServerInfo(serverInfo);

    let psk;
    try {
        psk = decodeURIComponent(pskPart);
    } catch (_) {
        psk = pskPart;
    }
    if (!psk || !host || !port) return null;

    const obfs = params.obfs ? {
        type: params.obfs,
        host: params['obfs-host'] || undefined
    } : undefined;

    return {
        tag: name,
        type: 'snell',
        server: host,
        server_port: port,
        psk,
        version: params.version !== undefined ? parseMaybeNumber(params.version) : undefined,
        tcp_fast_open: params.tfo !== undefined ? parseBool(params.tfo) : undefined,
        reuse: params.reuse !== undefined ? parseBool(params.reuse) : undefined,
        udp: params.udp !== undefined ? parseBool(params.udp) : undefined,
        obfs
    };
}
