/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import { RULE_SET_PROVIDERS } from '../config/ruleSetProviders.js';
import { UNIFIED_RULES } from '../config/rules.js';

export const CustomRuleSets = (props) => {
    const { t } = props;
    const providersJson = JSON.stringify(RULE_SET_PROVIDERS);
    const unsupportedLabel = t('ruleSetUrlPreviewUnsupported');

    // Translate-label map used when rendering rule-group options in the outbound dropdown
    const outboundLabels = {};
    UNIFIED_RULES.forEach((r) => { outboundLabels[r.name] = t('outboundNames.' + r.name); });

    return (
        <div x-data="customRuleSetsData()" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <i class="fas fa-cloud-download-alt text-gray-400"></i>
                    {t('customRuleSetsSection')}
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
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('customRuleSetsSectionTooltip')}</p>

            {/* Form mode */}
            <div x-show="mode === 'form'">
                <template x-if="rules.length === 0">
                    <div class="text-center py-12 bg-gray-50 dark:bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <p class="text-gray-500 dark:text-gray-400 mb-4">{t('noCustomRuleSetsForm')}</p>
                        <button type="button" x-on:click="addRule()" class="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg">
                            {t('addCustomRuleSet')}
                        </button>
                    </div>
                </template>

                <div class="space-y-4">
                    <template x-for="(rule, index) in rules" x-bind:key="rule.__uid || index">
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
                                'x-on:custom-rule-sets-clear.window': 'show = false'
                            }}
                        >
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="font-medium text-gray-900 dark:text-white" x-text="'#' + (index + 1) + ' ' + (rule.name || '(unnamed)')"></h3>
                                <button type="button" x-on:click="show = false; setTimeout(() => removeRule(index), 200)" class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="col-span-1 md:col-span-2">
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ruleSetName')}</label>
                                    <input type="text" x-model="rule.name" placeholder="MyReddit" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ruleSetProvider')}</label>
                                    <select x-model="rule.provider" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                        <option value="metacubex">MetaCubeX</option>
                                        <option value="blackmatrix7">blackmatrix7</option>
                                        <option value="loyalsoldier">Loyalsoldier</option>
                                        <option value="acl4ssr">ACL4SSR</option>
                                        <option value="custom">Custom URL</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ruleSetType')}</label>
                                    <select x-model="rule.type" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                        <option value="site">site</option>
                                        <option value="ip">ip</option>
                                    </select>
                                </div>
                                <div x-show="rule.provider !== 'custom'" class="col-span-1 md:col-span-2">
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ruleSetFile')}</label>
                                    <input type="text" x-model="rule.file" placeholder="reddit" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                    <template x-if="rule.provider !== 'custom' && rule.file">
                                        <div class="mt-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                                            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('ruleSetUrlPreview')}</p>
                                            <dl class="space-y-1 font-mono text-xs break-all">
                                                <div class="flex gap-2">
                                                    <dt class="shrink-0 text-gray-500 dark:text-gray-400 w-16">sing-box</dt>
                                                    <dd class="text-gray-700 dark:text-gray-300" x-text="previewUrl(rule, 'singbox')"></dd>
                                                </div>
                                                <div class="flex gap-2">
                                                    <dt class="shrink-0 text-gray-500 dark:text-gray-400 w-16">Clash</dt>
                                                    <dd class="text-gray-700 dark:text-gray-300" x-text="previewUrl(rule, 'clash')"></dd>
                                                </div>
                                                <div class="flex gap-2">
                                                    <dt class="shrink-0 text-gray-500 dark:text-gray-400 w-16">Surge</dt>
                                                    <dd class="text-gray-700 dark:text-gray-300" x-text="previewUrl(rule, 'surge')"></dd>
                                                </div>
                                            </dl>
                                        </div>
                                    </template>
                                </div>
                                <template x-if="rule.provider === 'custom'">
                                    <div class="col-span-1 md:col-span-2 space-y-3">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ruleSetUrlSingbox')}</label>
                                            <input type="url" x-model="rule.urls.singbox" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ruleSetUrlClash')}</label>
                                            <input type="url" x-model="rule.urls.clash" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ruleSetUrlSurge')}</label>
                                            <input type="url" x-model="rule.urls.surge" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                        </div>
                                    </div>
                                </template>
                                <div class="col-span-1 md:col-span-2">
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ruleSetOutbound')}</label>
                                    <select x-model="rule.outbound" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                        <optgroup label={t('outboundBuiltIn')}>
                                            <option value="Node Select">{t('outboundNames.Node Select')}</option>
                                            <option value="Auto Select">{t('outboundNames.Auto Select')}</option>
                                            <option value="Fall Back">{t('outboundNames.Fall Back')}</option>
                                            <option value="Manual Switch">{t('outboundNames.Manual Switch')}</option>
                                            <option value="DIRECT">DIRECT</option>
                                            <option value="REJECT">REJECT</option>
                                        </optgroup>
                                        <optgroup label={t('outboundSelectedRules')} x-show="(selectedRules || []).length > 0">
                                            <template x-for="key in (selectedRules || [])" x-bind:key="key">
                                                <option x-bind:value="key" x-text="OUTBOUND_LABELS[key] || key"></option>
                                            </template>
                                        </optgroup>
                                        <optgroup label={t('outboundPriorRulesets')} x-show="priorRulesetNames(index).length > 0">
                                            <template x-for="n in priorRulesetNames(index)" x-bind:key="n">
                                                <option x-bind:value="n" x-text="n"></option>
                                            </template>
                                        </optgroup>
                                        <optgroup label={t('outboundSurgeDevices')} x-show="surgeDeviceNames().length > 0">
                                            <template x-for="n in surgeDeviceNames()" x-bind:key="n">
                                                <option x-bind:value="'DEVICE:' + n" x-text="'DEVICE:' + n"></option>
                                            </template>
                                        </optgroup>
                                    </select>
                                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('ruleSetOutboundHint')}</p>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>

                <div class="mt-6 flex flex-wrap gap-3">
                    <button type="button" x-on:click="addRule()" class="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors font-medium flex items-center gap-2">
                        <i class="fas fa-plus"></i>
                        {t('addCustomRuleSet')}
                    </button>
                    <button type="button" x-on:click="clearAll()" x-show="rules.length > 0" class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium flex items-center gap-2">
                        <i class="fas fa-trash"></i>
                        {t('clearAll')}
                    </button>
                </div>
            </div>

            {/* JSON mode */}
            <div x-show="mode === 'json'">
                <textarea x-model="jsonContent" rows={12} class="w-full px-4 py-2 font-mono text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder='[{"name":"MyReddit","provider":"metacubex","file":"reddit","type":"site","outbound":"Node Select"}]'></textarea>
                <p x-show="jsonError" class="mt-2 text-sm text-red-600 dark:text-red-400" x-text="jsonError"></p>
            </div>

            <input type="hidden" name="customRuleSets" x-bind:value="JSON.stringify(rules, (k, v) => k === '__uid' ? undefined : v)" />

            <script dangerouslySetInnerHTML={{
                __html: `
                const RULE_SET_PROVIDERS = ${providersJson};
                const UNSUPPORTED_LABEL = ${JSON.stringify(unsupportedLabel)};
                const OUTBOUND_LABELS = ${JSON.stringify(outboundLabels)};
                const STATIC_OUTBOUND_VALUES = ['Node Select', 'Auto Select', 'Fall Back', 'Manual Switch', 'DIRECT', 'REJECT'];

                const crsUid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'rs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);

                function readFormSelectedRules() {
                    const boxes = document.querySelectorAll('input[type="checkbox"][x-model="selectedRules"]');
                    const out = [];
                    boxes.forEach(b => { if (b.checked) out.push(b.value); });
                    return out;
                }

                function readSiblingSurgeDevicesForRuleSets() {
                    const el = document.querySelector('input[name="surgeDevices"]');
                    if (!el || !el.value) return [];
                    try {
                        const parsed = JSON.parse(el.value);
                        return Array.isArray(parsed) ? parsed : [];
                    } catch { return []; }
                }

                function resolveProviderUrlClient(providerId, type, format, file) {
                    const provider = RULE_SET_PROVIDERS[providerId];
                    if (!provider) return null;
                    const spec = provider.formats && provider.formats[format] && provider.formats[format][type];
                    if (!spec) return null;
                    const stem = spec.filePattern.replace(/\\{file\\}/g, file);
                    return spec.base + stem + spec.ext;
                }

                function customRuleSetsData() {
                    return {
                        mode: 'form',
                        rules: [],
                        jsonContent: '[]',
                        jsonError: null,
                        surgeDevicesVersion: 0,
                        previewUrl(rule, format) {
                            if (!rule || rule.provider === 'custom' || !rule.file) return '';
                            const url = resolveProviderUrlClient(rule.provider, rule.type || 'site', format, rule.file);
                            return url || UNSUPPORTED_LABEL;
                        },
                        priorRulesetNames(currentIdx) {
                            const seen = new Set();
                            const result = [];
                            for (let i = 0; i < currentIdx && i < this.rules.length; i++) {
                                const n = this.rules[i] && this.rules[i].name;
                                if (n && !seen.has(n)) { seen.add(n); result.push(n); }
                            }
                            return result;
                        },
                        surgeDeviceNames() {
                            void this.surgeDevicesVersion;
                            const names = readSiblingSurgeDevicesForRuleSets().map(d => d && d.name).filter(Boolean);
                            return Array.from(new Set(names));
                        },
                        isValidOutbound(value, rowIdx) {
                            if (!value) return false;
                            if (STATIC_OUTBOUND_VALUES.includes(value)) return true;
                            const sel = readFormSelectedRules();
                            if (sel.includes(value)) return true;
                            for (let i = 0; i < rowIdx; i++) {
                                if (this.rules[i] && this.rules[i].name === value) return true;
                            }
                            if (typeof value === 'string' && value.startsWith('DEVICE:')) {
                                const name = value.slice(7);
                                if (this.surgeDeviceNames().includes(name)) return true;
                            }
                            return false;
                        },
                        validateOutbounds() {
                            this.rules.forEach((r, i) => {
                                if (!this.isValidOutbound(r.outbound, i)) r.outbound = 'Node Select';
                            });
                        },
                        init() {
                            this.$watch('rules', (v) => {
                                if (this.mode === 'form') this.jsonContent = JSON.stringify(v, null, 2);
                                window.dispatchEvent(new Event('custom-rulesets-changed'));
                            });
                            this.$watch('jsonContent', (v) => {
                                if (this.mode === 'json') {
                                    try {
                                        const parsed = JSON.parse(v);
                                        if (Array.isArray(parsed)) {
                                            this.rules = parsed.map(r => ({ __uid: r.__uid || crsUid(), ...r }));
                                            this.jsonError = null;
                                        } else this.jsonError = 'must be array';
                                    } catch (e) { this.jsonError = e.message; }
                                }
                            });
                            window.addEventListener('restore-custom-rule-sets', (event) => {
                                if (event.detail && Array.isArray(event.detail.rules)) {
                                    this.rules = event.detail.rules.map(r => ({ __uid: r.__uid || crsUid(), ...r }));
                                    this.jsonContent = JSON.stringify(this.rules, null, 2);
                                    this.mode = 'json';
                                }
                            });
                            // Watch parent scope's selectedRules to auto-reset invalidated outbounds
                            window.addEventListener('selected-rules-changed', () => this.validateOutbounds());
                            window.addEventListener('surge-devices-changed', () => {
                                this.surgeDevicesVersion++;
                                this.validateOutbounds();
                            });
                        },
                        addRule() {
                            this.rules.push({
                                __uid: crsUid(),
                                name: '', provider: 'metacubex', file: '',
                                urls: { singbox: '', clash: '', surge: '' },
                                type: 'site', outbound: 'Node Select'
                            });
                        },
                        removeRule(i) {
                            const removed = this.rules[i];
                            this.rules.splice(i, 1);
                            const removedName = removed && removed.name;
                            if (removedName) {
                                this.rules.forEach(r => {
                                    if (r.outbound === removedName) r.outbound = 'Node Select';
                                });
                            }
                        },
                        clearAll() {
                            if (!confirm('${t('confirmClearAllRules')}')) return;
                            this.$dispatch('custom-rule-sets-clear');
                            setTimeout(() => {
                                this.rules = [];
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
