/**
 * Rule-Set Provider Dictionary
 *
 * Maps (provider, type, format) -> URL template. Each entry describes
 * how to build a full URL given a filename stem.
 *
 *   type:   'site' | 'ip'
 *   format: 'singbox' | 'clash' | 'surge'
 *
 * filePattern uses {file} as a placeholder. Providers where a given
 * format is absent (e.g. acl4ssr + singbox) are intentionally omitted
 * and resolve to null (skip + warn in the builder).
 */

export const RULE_SET_PROVIDERS = {
	metacubex: {
		label: 'MetaCubeX',
		formats: {
			singbox: {
				site: { base: 'https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/sing/geo/geosite/', ext: '.srs', filePattern: '{file}' },
				ip:   { base: 'https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/sing/geo/geoip/',   ext: '.srs', filePattern: '{file}' }
			},
			clash: {
				site: { base: 'https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/', ext: '.mrs', filePattern: '{file}' },
				ip:   { base: 'https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geoip/',   ext: '.mrs', filePattern: '{file}' }
			},
			surge: {
				site: { base: 'https://gh-proxy.com/https://github.com/NSZA156/surge-geox-rules/raw/refs/heads/release/geo/geosite/', ext: '.conf', filePattern: '{file}' },
				ip:   { base: 'https://gh-proxy.com/https://github.com/NSZA156/surge-geox-rules/raw/refs/heads/release/geo/geoip/',   ext: '.txt',  filePattern: '{file}' }
			}
		}
	},
	blackmatrix7: {
		label: 'blackmatrix7',
		formats: {
			singbox: {
				site: { base: 'https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/sing-box/', ext: '.srs', filePattern: '{file}/{file}' },
				ip:   { base: 'https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/sing-box/', ext: '.srs', filePattern: '{file}/{file}' }
			},
			clash: {
				site: { base: 'https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/Clash/', ext: '.yaml', filePattern: '{file}/{file}' },
				ip:   { base: 'https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/Clash/', ext: '.yaml', filePattern: '{file}/{file}' }
			},
			surge: {
				site: { base: 'https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/Surge/', ext: '.list', filePattern: '{file}/{file}' },
				ip:   { base: 'https://gh-proxy.com/https://github.com/blackmatrix7/ios_rule_script/raw/refs/heads/master/rule/Surge/', ext: '.list', filePattern: '{file}/{file}' }
			}
		}
	},
	loyalsoldier: {
		label: 'Loyalsoldier',
		formats: {
			singbox: {
				site: { base: 'https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/sing/geo-lite/geosite/', ext: '.srs', filePattern: '{file}' },
				ip:   { base: 'https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/sing/geo-lite/geoip/',   ext: '.srs', filePattern: '{file}' }
			},
			clash: {
				site: { base: 'https://gh-proxy.com/https://github.com/Loyalsoldier/clash-rules/raw/refs/heads/release/', ext: '.yaml', filePattern: '{file}' },
				ip:   { base: 'https://gh-proxy.com/https://github.com/Loyalsoldier/clash-rules/raw/refs/heads/release/', ext: '.yaml', filePattern: '{file}' }
			}
		}
	},
	acl4ssr: {
		label: 'ACL4SSR',
		formats: {
			clash: {
				site: { base: 'https://gh-proxy.com/https://github.com/ACL4SSR/ACL4SSR/raw/refs/heads/master/Clash/Providers/', ext: '.yaml', filePattern: '{file}' },
				ip:   { base: 'https://gh-proxy.com/https://github.com/ACL4SSR/ACL4SSR/raw/refs/heads/master/Clash/Providers/', ext: '.yaml', filePattern: '{file}' }
			},
			surge: {
				site: { base: 'https://gh-proxy.com/https://github.com/ACL4SSR/ACL4SSR/raw/refs/heads/master/Surge/', ext: '.list', filePattern: '{file}' },
				ip:   { base: 'https://gh-proxy.com/https://github.com/ACL4SSR/ACL4SSR/raw/refs/heads/master/Surge/', ext: '.list', filePattern: '{file}' }
			}
		}
	}
};

export function resolveProviderUrl(providerId, type, format, file) {
	const provider = RULE_SET_PROVIDERS[providerId];
	if (!provider) return null;
	const spec = provider.formats?.[format]?.[type];
	if (!spec) return null;
	const stem = spec.filePattern.replace(/\{file\}/g, file);
	return `${spec.base}${stem}${spec.ext}`;
}
