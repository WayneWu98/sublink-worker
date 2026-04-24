/**
 * Rule Generators
 * Functions for generating rules and rule sets
 */

import { UNIFIED_RULES, PREDEFINED_RULE_SETS, SITE_RULE_SETS, IP_RULE_SETS, CLASH_SITE_RULE_SETS, CLASH_IP_RULE_SETS } from './rules.js';
import { SITE_RULE_SET_BASE_URL, IP_RULE_SET_BASE_URL, CLASH_SITE_RULE_SET_BASE_URL, CLASH_IP_RULE_SET_BASE_URL } from './ruleUrls.js';
import { resolveProviderUrl } from './ruleSetProviders.js';

/**
 * Resolve the rule-set file URL for a customRuleSets entry under a given format.
 * Returns null when the provider lacks the requested format (format-gated) or
 * when provider === 'custom' and no URL was supplied for that format.
 *
 *   format: 'singbox' | 'clash' | 'surge'
 */
export function resolveCustomRuleSetUrl(item, format) {
	if (!item || !item.type) return null;
	if (item.provider === 'custom') {
		const url = item.urls?.[format];
		return (typeof url === 'string' && url.length > 0) ? url : null;
	}
	if (!item.file) return null;
	return resolveProviderUrl(item.provider, item.type, format, item.file);
}

function toStringArray(value) {
	if (Array.isArray(value)) {
		return value
			.filter(x => typeof x === 'string').map(x => x.trim())
			.filter(Boolean);
	}
	if (typeof value === 'string') {
		return value.split(',').map(x => x.trim()).filter(Boolean);
	}
	return [];
}

// Helper function to get outbounds based on selected rule names
export function getOutbounds(selectedRuleNames) {
	if (!selectedRuleNames || !Array.isArray(selectedRuleNames)) {
		return [];
	}
	return UNIFIED_RULES
		.filter(rule => selectedRuleNames.includes(rule.name))
		.map(rule => rule.name);
}

// Helper function to generate rules based on selected rule names
export function generateRules(selectedRules = [], customRules = [], customRuleSets = []) {
	if (typeof selectedRules === 'string' && PREDEFINED_RULE_SETS[selectedRules]) {
		selectedRules = PREDEFINED_RULE_SETS[selectedRules];
	}

	if (!selectedRules || selectedRules.length === 0) {
		selectedRules = PREDEFINED_RULE_SETS.minimal;
	}

	const rules = [];

	UNIFIED_RULES.forEach(rule => {
		if (selectedRules.includes(rule.name)) {
			rules.push({
				site_rules: rule.site_rules,
				ip_rules: rule.ip_rules,
				domain_suffix: rule?.domain_suffix,
				ip_cidr: rule?.ip_cidr,
				outbound: rule.name
			});
		}
	});

	customRules.reverse();
	customRules.forEach((rule) => {
		rules.unshift({
			site_rules: toStringArray(rule.site),
			ip_rules: toStringArray(rule.ip),
			domain: toStringArray(rule.domain),
			domain_suffix: toStringArray(rule.domain_suffix),
			domain_keyword: toStringArray(rule.domain_keyword),
			ip_cidr: toStringArray(rule.ip_cidr),
			src_ip_cidr: toStringArray(rule.src_ip_cidr),
			resolve_ip: !!rule.resolve_ip,
			protocol: toStringArray(rule.protocol),
			outbound: rule.name
		});
	});

	// customRuleSets: highest priority — unshifted to the front so they beat
	// built-in rules. Traffic routes to a NEW selector group named after the
	// user's name (builders create it in addCustomRuleSetGroups). The form's
	// outbound field becomes that group's default member.
	[...(customRuleSets || [])].reverse().forEach((item) => {
		if (!item || !item.type) return;
		const name = (item.name && item.name.trim()) || (item.file && item.file.trim());
		if (!name) return;
		rules.unshift({
			site_rules: item.type === 'site' ? [name] : [],
			ip_rules:   item.type === 'ip'   ? [name] : [],
			outbound: name,
			_customRuleSet: { ...item, name }
		});
	});

	return rules;
}

export function generateRuleSets(selectedRules = [], customRules = [], customRuleSets = []) {
	if (typeof selectedRules === 'string' && PREDEFINED_RULE_SETS[selectedRules]) {
		selectedRules = PREDEFINED_RULE_SETS[selectedRules];
	}

	if (!selectedRules || selectedRules.length === 0) {
		selectedRules = PREDEFINED_RULE_SETS.minimal;
	}

	const selectedRulesSet = new Set(selectedRules);

	const siteRuleSets = new Set();
	const ipRuleSets = new Set();

	const ruleSets = [];

	UNIFIED_RULES.forEach(rule => {
		if (selectedRulesSet.has(rule.name)) {
			rule.site_rules.forEach(siteRule => siteRuleSets.add(siteRule));
			rule.ip_rules.forEach(ipRule => ipRuleSets.add(ipRule));
		}
	});

	const site_rule_sets = Array.from(siteRuleSets).map(rule => ({
		tag: rule,
		type: 'remote',
		format: 'binary',
		url: `${SITE_RULE_SET_BASE_URL}${SITE_RULE_SETS[rule]}`,
	}));

	const ip_rule_sets = Array.from(ipRuleSets).map(rule => ({
		tag: `${rule}-ip`,
		type: 'remote',
		format: 'binary',
		url: `${IP_RULE_SET_BASE_URL}${IP_RULE_SETS[rule]}`,
	}));

	if (!selectedRules.includes('Non-China')) {
		site_rule_sets.push({
			tag: 'geolocation-!cn',
			type: 'remote',
			format: 'binary',
			url: `${SITE_RULE_SET_BASE_URL}geolocation-!cn.srs`,
		});
	}

	if (customRules) {
		customRules.forEach(rule => {
			toStringArray(rule.site).forEach(site => {
				site_rule_sets.push({
					tag: site,
					type: 'remote',
					format: 'binary',
					url: `${SITE_RULE_SET_BASE_URL}${site}.srs`,
				});
			});
			toStringArray(rule.ip).forEach(ip => {
				ip_rule_sets.push({
					tag: `${ip}-ip`,
					type: 'remote',
					format: 'binary',
					url: `${IP_RULE_SET_BASE_URL}${ip}.srs`,
				});
			});
		});
	}

	// customRuleSets: resolve each URL per sing-box and push onto the right set
	(customRuleSets || []).forEach((item) => {
		if (!item || !item.type) return;
		const name = (item.name && item.name.trim()) || (item.file && item.file.trim());
		if (!name) return;
		const url = resolveCustomRuleSetUrl(item, 'singbox');
		if (!url) return;
		if (item.type === 'site') {
			site_rule_sets.push({ tag: name, type: 'remote', format: 'binary', url });
		} else {
			ip_rule_sets.push({ tag: `${name}-ip`, type: 'remote', format: 'binary', url });
		}
	});

	ruleSets.push(...site_rule_sets, ...ip_rule_sets);

	return { site_rule_sets, ip_rule_sets };
}

// Generate rule sets for Clash using .mrs format
export function generateClashRuleSets(selectedRules = [], customRules = [], useMrs = true, customRuleSets = []) {
	if (typeof selectedRules === 'string' && PREDEFINED_RULE_SETS[selectedRules]) {
		selectedRules = PREDEFINED_RULE_SETS[selectedRules];
	}

	if (!selectedRules || selectedRules.length === 0) {
		selectedRules = PREDEFINED_RULE_SETS.minimal;
	}

	// Determine format based on client compatibility
	const format = useMrs ? 'mrs' : 'yaml';
	const ext = useMrs ? '.mrs' : '.yaml';

	const selectedRulesSet = new Set(selectedRules);

	const siteRuleSets = new Set();
	const ipRuleSets = new Set();

	UNIFIED_RULES.forEach(rule => {
		if (selectedRulesSet.has(rule.name)) {
			rule.site_rules.forEach(siteRule => siteRuleSets.add(siteRule));
			rule.ip_rules.forEach(ipRule => ipRuleSets.add(ipRule));
		}
	});

	const site_rule_providers = {};
	const ip_rule_providers = {};

	Array.from(siteRuleSets).forEach(rule => {
		site_rule_providers[rule] = {
			type: 'http',
			format: format,
			behavior: 'domain',
			url: `${CLASH_SITE_RULE_SET_BASE_URL}${rule}${ext}`,
			path: `./ruleset/${rule}${ext}`,
			interval: 86400
		};
	});

	Array.from(ipRuleSets).forEach(rule => {
		ip_rule_providers[`${rule}-ip`] = {
			type: 'http',
			format: format,
			behavior: 'ipcidr',
			url: `${CLASH_IP_RULE_SET_BASE_URL}${rule}${ext}`,
			path: `./ruleset/${rule}-ip${ext}`,
			interval: 86400
		};
	});

	// Add Non-China rule set if not included
	if (!selectedRules.includes('Non-China')) {
		site_rule_providers['geolocation-!cn'] = {
			type: 'http',
			format: format,
			behavior: 'domain',
			url: `${CLASH_SITE_RULE_SET_BASE_URL}geolocation-!cn${ext}`,
			path: `./ruleset/geolocation-!cn${ext}`,
			interval: 86400
		};
	}

	// Add custom rules
	if (customRules) {
		customRules.forEach(rule => {
			toStringArray(rule.site).forEach(site => {
				site_rule_providers[site] = {
					type: 'http',
					format: format,
					behavior: 'domain',
					url: `${CLASH_SITE_RULE_SET_BASE_URL}${site}${ext}`,
					path: `./ruleset/${site}${ext}`,
					interval: 86400
				};
			});
			toStringArray(rule.ip).forEach(ip => {
				ip_rule_providers[`${ip}-ip`] = {
					type: 'http',
					format: format,
					behavior: 'ipcidr',
					url: `${CLASH_IP_RULE_SET_BASE_URL}${ip}${ext}`,
					path: `./ruleset/${ip}-ip${ext}`,
					interval: 86400
				};
			});
		});
	}

	// customRuleSets: resolve each URL under clash. Pick format by URL suffix
	// so mixed providers (metacubex .mrs + loyalsoldier .yaml + custom) coexist.
	(customRuleSets || []).forEach((item) => {
		if (!item || !item.type) return;
		const name = (item.name && item.name.trim()) || (item.file && item.file.trim());
		if (!name) return;
		const url = resolveCustomRuleSetUrl(item, 'clash');
		if (!url) return;
		const lowerUrl = url.toLowerCase();
		const itemFormat = lowerUrl.endsWith('.mrs')  ? 'mrs'
		                 : lowerUrl.endsWith('.yaml') ? 'yaml'
		                 : lowerUrl.endsWith('.list') ? 'text'
		                 : (useMrs ? 'mrs' : 'yaml');
		const itemExt = lowerUrl.endsWith('.mrs')  ? '.mrs'
		              : lowerUrl.endsWith('.yaml') ? '.yaml'
		              : lowerUrl.endsWith('.list') ? '.list'
		              : (useMrs ? '.mrs' : '.yaml');
		if (item.type === 'site') {
			site_rule_providers[name] = {
				type: 'http', format: itemFormat, behavior: 'domain', url,
				path: `./ruleset/${name}${itemExt}`, interval: 86400
			};
		} else {
			ip_rule_providers[`${name}-ip`] = {
				type: 'http', format: itemFormat, behavior: 'ipcidr', url,
				path: `./ruleset/${name}-ip${itemExt}`, interval: 86400
			};
		}
	});

	return { site_rule_providers, ip_rule_providers };
}
