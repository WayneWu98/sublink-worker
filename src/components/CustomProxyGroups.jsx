/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import { UNIFIED_RULES } from '../config/rules.js';

export const CustomProxyGroups = (props) => {
    const { t } = props;
    const outboundLabels = {};
    UNIFIED_RULES.forEach((r) => { outboundLabels[r.name] = t('outboundNames.' + r.name); });

    return (
        <div x-data="customProxyGroupsData()" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <i class="fas fa-layer-group text-gray-400"></i>
                    {t('customProxyGroupsSection')}
                </h3>
                <div class="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button type="button" x-on:click="mode = 'form'"
                        x-bind:class="{'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400 shadow-sm': mode === 'form', 'text-gray-500 dark:text-gray-400': mode !== 'form'}"
                        class="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2">
                        <i class="fas fa-list"></i>
                        {t('customRulesForm')}
                    </button>
                    <button type="button" x-on:click="mode = 'json'"
                        x-bind:class="{'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400 shadow-sm': mode === 'json', 'text-gray-500 dark:text-gray-400': mode !== 'json'}"
                        class="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2">
                        <i class="fas fa-code"></i>
                        {t('customRulesJSON')}
                    </button>
                </div>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('customProxyGroupsSectionTooltip')}</p>

            {/* Form mode */}
            <div x-show="mode === 'form'">
                <template x-if="groups.length === 0">
                    <div class="text-center py-12 bg-gray-50 dark:bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <div class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                            <i class="fas fa-plus text-2xl"></i>
                        </div>
                        <p class="text-gray-500 dark:text-gray-400 mb-4">{t('noCustomProxyGroupsForm')}</p>
                        <button type="button" x-on:click="addGroup()" class="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200 font-medium">
                            {t('addCustomProxyGroup')}
                        </button>
                    </div>
                </template>

                <div class="space-y-4">
                    <template x-for="(group, index) in groups" x-bind:key="group.__uid || index">
                        <div
                            x-data="{ show: false }"
                            x-init="$nextTick(() => show = true)"
                            x-show="show"
                            class="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border border-gray-200 dark:border-gray-700 transition-all duration-200 hover:border-primary-200 dark:hover:border-primary-900/50"
                            {...{
                                'x-transition:enter': 'transition ease-out duration-300',
                                'x-transition:enter-start': 'opacity-0 -translate-y-2 scale-95',
                                'x-transition:enter-end': 'opacity-100 translate-y-0 scale-100',
                                'x-transition:leave': 'transition ease-in duration-200',
                                'x-transition:leave-start': 'opacity-100 translate-y-0 scale-100',
                                'x-transition:leave-end': 'opacity-0 translate-y-2 scale-95',
                                'x-on:custom-proxy-groups-clear.window': 'show = false'
                            }}
                        >
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="font-medium text-gray-900 dark:text-white" x-text="'#' + (index + 1) + ' ' + (group.name || '(unnamed)')"></h3>
                                <button type="button" x-on:click="show = false; setTimeout(() => removeGroup(index), 200)" class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('proxyGroupName')}</label>
                                    <input type="text" x-model="group.name" placeholder="🇭🇰 HK Auto" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('proxyGroupType')}</label>
                                    <select x-model="group.type" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                        <option value="select">select</option>
                                        <option value="url-test">url-test</option>
                                        <option value="fallback">fallback</option>
                                        <option value="load-balance">load-balance</option>
                                    </select>
                                </div>
                                <div class="col-span-1 md:col-span-2">
                                    <span class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('proxyGroupMembers')}</span>
                                    <label class="w-full min-h-[2.75rem] px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 flex flex-wrap items-center gap-2 cursor-pointer focus-within:ring-2 focus-within:ring-primary-500">
                                        <template x-for="m in (group.proxies || [])" x-bind:key="m">
                                            <span {...{'x-on:click.prevent.stop': 'group.proxies = group.proxies.filter(x => x !== m)'}} class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 text-sm font-medium cursor-pointer hover:bg-primary-100 dark:hover:bg-primary-900/50">
                                                <span x-text="memberLabel(m)"></span>
                                                <i class="fas fa-times text-xs opacity-60"></i>
                                            </span>
                                        </template>
                                        <select x-on:change="const v = $event.target.value; if (v && !(group.proxies || []).includes(v)) group.proxies.push(v); $event.target.value = '';" class="flex-1 min-w-[8rem] bg-transparent border-0 p-1 text-sm text-gray-900 dark:text-white focus:ring-0 focus:outline-none cursor-pointer">
                                            <option value="" disabled selected hidden>{t('proxyGroupMembersPlaceholder')}</option>
                                            <optgroup label={t('outboundBuiltIn')}>
                                                <option value="Node Select">{t('outboundNames.Node Select')}</option>
                                                <option value="Auto Select">{t('outboundNames.Auto Select')}</option>
                                                <option value="Fall Back">{t('outboundNames.Fall Back')}</option>
                                                <option value="DIRECT">DIRECT</option>
                                                <option value="REJECT">REJECT</option>
                                            </optgroup>
                                            <optgroup label={t('outboundSelectedRules')} x-show="(selectedRuleNames() || []).length > 0">
                                                <template x-for="key in selectedRuleNames()" x-bind:key="key">
                                                    <option x-bind:value="key" x-text="CPG_OUTBOUND_LABELS[key] || key"></option>
                                                </template>
                                            </optgroup>
                                            <optgroup label={t('customRuleSetsSection')} x-show="customRuleSetNames().length > 0">
                                                <template x-for="n in customRuleSetNames()" x-bind:key="n">
                                                    <option x-bind:value="n" x-text="n"></option>
                                                </template>
                                            </optgroup>
                                            <optgroup label={t('outboundSurgeDevices')} x-show="surgeDeviceNames().length > 0">
                                                <template x-for="n in surgeDeviceNames()" x-bind:key="n">
                                                    <option x-bind:value="'DEVICE:' + n" x-text="'DEVICE:' + n"></option>
                                                </template>
                                            </optgroup>
                                            <optgroup label={t('customProxyGroupsSection')} x-show="otherGroupNames(index).length > 0">
                                                <template x-for="n in otherGroupNames(index)" x-bind:key="n">
                                                    <option x-bind:value="n" x-text="n"></option>
                                                </template>
                                            </optgroup>
                                        </select>
                                    </label>
                                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('proxyGroupMembersHint')}</p>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>

                <div class="mt-6 flex flex-wrap gap-3">
                    <button type="button" x-on:click="addGroup()" class="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors font-medium flex items-center gap-2">
                        <i class="fas fa-plus"></i>
                        {t('addCustomProxyGroup')}
                    </button>
                    <button type="button" x-on:click="clearAll()" x-show="groups.length > 0" class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium flex items-center gap-2">
                        <i class="fas fa-trash"></i>
                        {t('clearAll')}
                    </button>
                </div>
            </div>

            {/* JSON mode */}
            <div x-show="mode === 'json'">
                <textarea x-model="jsonContent" rows={12} class="w-full px-4 py-2 font-mono text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder='[{"name":"🇭🇰 HK Auto","type":"url-test","filter":"香港|HK","proxies":[]}]'></textarea>
                <p x-show="jsonError" class="mt-2 text-sm text-red-600 dark:text-red-400" x-text="jsonError"></p>
            </div>

            <input type="hidden" name="customProxyGroups" x-bind:value="JSON.stringify(groups, (k, v) => k === '__uid' ? undefined : v)" />

            <script dangerouslySetInnerHTML={{
                __html: `
                const CPG_OUTBOUND_LABELS = ${JSON.stringify(outboundLabels)};
                const CPG_MEMBER_LABELS = Object.assign({}, CPG_OUTBOUND_LABELS, {
                    'Node Select': ${JSON.stringify(t('outboundNames.Node Select'))},
                    'Auto Select': ${JSON.stringify(t('outboundNames.Auto Select'))},
                    'Fall Back': ${JSON.stringify(t('outboundNames.Fall Back'))}
                });
                const CPG_STATIC = ['Node Select', 'Auto Select', 'Fall Back', 'DIRECT', 'REJECT'];

                const cpgUid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'pg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);

                function cpgReadSelectedRules() {
                    const boxes = document.querySelectorAll('input[type="checkbox"][x-model="selectedRules"]');
                    const out = [];
                    boxes.forEach(b => { if (b.checked) out.push(b.value); });
                    return out;
                }

                function cpgReadHidden(name) {
                    const el = document.querySelector('input[name="' + name + '"]');
                    if (!el || !el.value) return [];
                    try { const p = JSON.parse(el.value); return Array.isArray(p) ? p : []; } catch { return []; }
                }

                function customProxyGroupsData() {
                    return {
                        mode: 'form',
                        groups: [],
                        jsonContent: '[]',
                        jsonError: null,
                        ruleSetsVersion: 0,
                        surgeDevicesVersion: 0,
                        selectedRuleNames() { return cpgReadSelectedRules(); },
                        customRuleSetNames() {
                            void this.ruleSetsVersion;
                            return Array.from(new Set(cpgReadHidden('customRuleSets').map(r => r && r.name).filter(Boolean)));
                        },
                        surgeDeviceNames() {
                            void this.surgeDevicesVersion;
                            return Array.from(new Set(cpgReadHidden('surgeDevices').map(d => d && d.name).filter(Boolean)));
                        },
                        otherGroupNames(currentIdx) {
                            const out = [];
                            this.groups.forEach((g, i) => {
                                if (i !== currentIdx && g && g.name) out.push(g.name);
                            });
                            return Array.from(new Set(out));
                        },
                        memberLabel(v) { return CPG_MEMBER_LABELS[v] || v; },
                        isValidMember(v, idx) {
                            if (!v) return false;
                            if (CPG_STATIC.includes(v)) return true;
                            if (this.selectedRuleNames().includes(v)) return true;
                            if (this.customRuleSetNames().includes(v)) return true;
                            if (typeof v === 'string' && v.indexOf('DEVICE:') === 0 && this.surgeDeviceNames().includes(v.slice(7))) return true;
                            if (this.otherGroupNames(idx).includes(v)) return true;
                            return false;
                        },
                        // Drop member references whose target was deselected / renamed / deleted.
                        // Idempotent: only reassigns when something is actually removed (no watch loop).
                        validateMembers() {
                            this.groups.forEach((g, i) => {
                                if (!Array.isArray(g.proxies)) return;
                                const filtered = g.proxies.filter(v => this.isValidMember(v, i));
                                if (filtered.length !== g.proxies.length) g.proxies = filtered;
                            });
                        },
                        init() {
                            this.$watch('groups', (v) => {
                                if (this.mode === 'form') this.jsonContent = JSON.stringify(v, (k, val) => k === '__uid' ? undefined : val, 2);
                                window.dispatchEvent(new Event('custom-proxy-groups-changed'));
                            });
                            this.$watch('jsonContent', (v) => {
                                if (this.mode === 'json') {
                                    try {
                                        const parsed = JSON.parse(v);
                                        if (Array.isArray(parsed)) {
                                            this.groups = parsed.map(g => ({ __uid: g.__uid || cpgUid(), ...g }));
                                            this.jsonError = null;
                                        } else this.jsonError = 'must be array';
                                    } catch (e) { this.jsonError = e.message; }
                                }
                            });
                            window.addEventListener('restore-custom-proxy-groups', (event) => {
                                if (event.detail && Array.isArray(event.detail.groups)) {
                                    this.groups = event.detail.groups.map(g => ({ __uid: g.__uid || cpgUid(), ...g }));
                                    this.jsonContent = JSON.stringify(this.groups, (k, v) => k === '__uid' ? undefined : v, 2);
                                    this.mode = 'json';
                                }
                            });
                            // Re-render member options AND prune now-invalid member refs when
                            // sibling selected-rules / rule-sets / devices change.
                            window.addEventListener('selected-rules-changed', () => this.validateMembers());
                            window.addEventListener('custom-rulesets-changed', () => { this.ruleSetsVersion++; this.validateMembers(); });
                            window.addEventListener('surge-devices-changed', () => { this.surgeDevicesVersion++; this.validateMembers(); });
                        },
                        addGroup() {
                            this.groups.push({
                                __uid: cpgUid(),
                                name: '', type: 'select', proxies: []
                            });
                        },
                        removeGroup(i) { this.groups.splice(i, 1); this.validateMembers(); },
                        clearAll() {
                            if (!confirm('${t('confirmClearAllRules')}')) return;
                            this.$dispatch('custom-proxy-groups-clear');
                            setTimeout(() => {
                                this.groups = [];
                                this.jsonContent = '[]';
                            }, 200);
                        }
                    }
                }
                `
            }} />
        </div>
    );
};
