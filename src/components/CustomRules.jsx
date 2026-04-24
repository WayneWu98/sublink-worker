/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import { ValidatedTextarea } from './ValidatedTextarea.jsx';
import { UNIFIED_RULES } from '../config/rules.js';

export const CustomRules = (props) => {
    const { t } = props;

    const outboundLabels = {};
    UNIFIED_RULES.forEach((r) => { outboundLabels[r.name] = t('outboundNames.' + r.name); });

    return (
        <div x-data="customRulesData()" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <i class="fas fa-stream text-gray-400"></i>
                    {t('customRulesSection')}
                </h3>
            </div>

            <div class="flex flex-col sm:flex-row justify-between items-end sm:items-center mb-6 gap-4">
                <p class="text-sm text-gray-500 dark:text-gray-400">{t('customRulesSectionTooltip')}</p>

                <div class="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button
                        type="button" x-on:click="mode = 'form'"
                    x-bind:class="{'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400 shadow-sm': mode === 'form', 'text-gray-500 dark:text-gray-400': mode !== 'form'}"
                    class="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2"
          >
                    <i class="fas fa-list"></i>
                    {t('customRulesForm')}
                </button>
                <button
                    type="button" x-on:click="mode = 'json'"
                x-bind:class="{'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400 shadow-sm': mode === 'json', 'text-gray-500 dark:text-gray-400': mode !== 'json'}"
                class="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2"
          >
                <i class="fas fa-code"></i>
                {t('customRulesJSON')}
            </button>
        </div>
      </div>

    {/* Form Mode */ }
    <div x-show="mode === 'form'" {...{'x-transition:enter': 'transition ease-out duration-300', 'x-transition:enter-start': 'opacity-0 transform scale-95', 'x-transition:enter-end': 'opacity-100 transform scale-100'}}>
        <template x-if="rules.length === 0">
            <div class="text-center py-12 bg-gray-50 dark:bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <div class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                    <i class="fas fa-plus text-2xl"></i>
                </div>
                <p class="text-gray-500 dark:text-gray-400 mb-4">{t('noCustomRulesForm')}</p>
                <button type="button" x-on:click="addRule()" class="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200 font-medium">
                {t('addCustomRule')}
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
            'x-on:custom-rules-clear.window': 'show = false'
          }}
        >
            <div class="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                <h3 class="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <span class="w-6 h-6 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs" x-text="index + 1"></span>
                    {t('customRule')}
                </h3>
                <button
                  type="button"
                  x-on:click="show = false; setTimeout(() => removeRule(index), 200)"
                  class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Outbound target (was free-text 'name'; now a dropdown of valid outbounds) */}
            <div class="col-span-1 md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('ruleSetOutbound')}
                </label>
                <select
                    x-model="rule.name"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                >
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
                            <option x-bind:value="key" x-text="CR_OUTBOUND_LABELS[key] || key"></option>
                        </template>
                    </optgroup>
                    <optgroup label={t('outboundPriorRulesets')} x-show="customRuleSetNames().length > 0">
                        <template x-for="n in customRuleSetNames()" x-bind:key="n">
                            <option x-bind:value="n" x-text="n"></option>
                        </template>
                    </optgroup>
                </select>
            </div>

            {/* Domain (exact match) */}
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                    {t('customRuleDomain')}
                    <i class="fas fa-info-circle text-gray-400 hover:text-primary-500 cursor-help" title={t('customRuleDomainTooltip')}></i>
                </label>
                <input
                    type="text"
                    x-model="rule.domain"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                    placeholder={t('customRuleDomainPlaceholder')}
                />
            </div>

            {/* Domain Suffix */}
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('customRuleDomainSuffix')}
                </label>
                <input
                    type="text"
                    x-model="rule.domain_suffix"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                    placeholder={t('customRuleDomainSuffixPlaceholder')}
                />
            </div>

            {/* Domain Keyword */}
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('customRuleDomainKeyword')}
                </label>
                <input
                    type="text"
                    x-model="rule.domain_keyword"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                    placeholder={t('customRuleDomainKeywordPlaceholder')}
                />
            </div>

            {/* SRC IP CIDR */}
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                    {t('customRuleSrcIPCIDR')}
                    <i class="fas fa-info-circle text-gray-400 hover:text-primary-500 cursor-help" title={t('customRuleSrcIPCIDRTooltip')}></i>
                </label>
                <input
                    type="text"
                    x-model="rule.src_ip_cidr"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                    placeholder={t('customRuleSrcIPCIDRPlaceholder')}
                />
            </div>

            {/* IP CIDR */}
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('customRuleIPCIDR')}
                </label>
                <input
                    type="text"
                    x-model="rule.ip_cidr"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                    placeholder={t('customRuleIPCIDRPlaceholder')}
                />
            </div>

            {/* Protocol */}
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                    {t('customRuleProtocol')}
                    <i class="fas fa-info-circle text-gray-400 hover:text-primary-500 cursor-help" title={t('customRuleProtocolTooltip')}></i>
                </label>
                <input
                    type="text"
                    x-model="rule.protocol"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                    placeholder={t('customRuleProtocolPlaceholder')}
                />
            </div>

            {/* Geo-Site */}
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                    {t('customRuleGeoSite')}
                    <i class="fas fa-info-circle text-gray-400 hover:text-primary-500 cursor-help" title={t('customRuleGeoSiteTooltip')}></i>
                </label>
                <input
                    type="text"
                    x-model="rule.site"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                    placeholder={t('customRuleGeoSitePlaceholder')}
                />
            </div>

            {/* Geo-IP */}
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                    {t('customRuleGeoIP')}
                    <i class="fas fa-info-circle text-gray-400 hover:text-primary-500 cursor-help" title={t('customRuleGeoIPTooltip')}></i>
                </label>
                <input
                    type="text"
                    x-model="rule.ip"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                    placeholder={t('customRuleGeoIPPlaceholder')}
                />
            </div>
        </div>
    </div>
          </template>
        </div>

        <div class="mt-6 flex flex-wrap gap-3">
          <button type="button" x-on:click="addRule()" class="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors duration-200 font-medium flex items-center gap-2">
            <i class="fas fa-plus"></i>
            {t('addCustomRule')}
          </button>
          <button type="button" x-on:click="clearAll()" x-show="rules.length > 0" class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors duration-200 font-medium flex items-center gap-2" >
    <i class="fas fa-trash"></i>
{ t('clearAll') }
          </button>
        </div>
      </div>

    {/* JSON Mode */ }
    <div x-show="mode === 'json'" {...{'x-transition:enter': 'transition ease-out duration-300', 'x-transition:enter-start': 'opacity-0 transform scale-95', 'x-transition:enter-end': 'opacity-100 transform scale-100'}}>
        <ValidatedTextarea
          id="customRulesJson"
          name="customRulesJson"
          model="jsonContent"
          placeholder='[{"name": "MyRule", "domain": "example.com", "domain_suffix": "example.net", "outbound": "Proxy"}]'
          variant="mono"
          textareaClass="min-h-[16rem]"
          containerClass="group"
          labelWrapperClass="flex items-center justify-end mb-2"
          labelActionsWrapperClass="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          inlineActionsWrapperClass="absolute bottom-4 right-4 flex gap-2"
          preserveLabelSpace={false}
          pasteLabel={t('paste')}
          clearLabel={t('clear')}
          validation={{
            button: {
              key: 'validate-json',
              label: t('validateJSON'),
              attrs: { 'x-on:click': 'validateJson()' }
            },
            error: {
              show: 'jsonError',
              textExpr: 'jsonError'
            },
            success: {
              show: 'jsonValid',
              text: t('allJSONValid')
            }
          }}
        />
      </div>

    {/* Hidden input to store the final JSON for form submission */ }
    <input type="hidden" name="customRules" x-bind:value="JSON.stringify(rules, (k, v) => k === '__uid' ? undefined : v)" />

        <script dangerouslySetInnerHTML={{
            __html: `
        const CR_OUTBOUND_LABELS = ${JSON.stringify(outboundLabels)};
        const CR_STATIC_OUTBOUND_VALUES = ['Node Select', 'Auto Select', 'Fall Back', 'Manual Switch', 'DIRECT', 'REJECT'];

        const crUid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);

        function readFormSelectedRules() {
          const boxes = document.querySelectorAll('input[type="checkbox"][x-model="selectedRules"]');
          const out = [];
          boxes.forEach(b => { if (b.checked) out.push(b.value); });
          return out;
        }

        function readSiblingCustomRuleSets() {
          const el = document.querySelector('input[name="customRuleSets"]');
          if (!el || !el.value) return [];
          try {
            const parsed = JSON.parse(el.value);
            return Array.isArray(parsed) ? parsed : [];
          } catch { return []; }
        }

        function customRulesData() {
          return {
            mode: 'form',
            rules: [],
            jsonContent: '[]',
            jsonError: null,
            jsonValid: false,
            // Bumped whenever sibling customRuleSets changes so the dropdown re-renders
            ruleSetsVersion: 0,

            customRuleSetNames() {
              // Reference this.ruleSetsVersion so Alpine treats this as reactive
              void this.ruleSetsVersion;
              const names = readSiblingCustomRuleSets().map(r => r && r.name).filter(Boolean);
              return Array.from(new Set(names));
            },

            isValidOutbound(value) {
              if (!value) return false;
              if (CR_STATIC_OUTBOUND_VALUES.includes(value)) return true;
              const sel = readFormSelectedRules();
              if (sel.includes(value)) return true;
              if (this.customRuleSetNames().includes(value)) return true;
              return false;
            },

            validateOutbounds() {
              this.rules.forEach((r) => {
                if (!this.isValidOutbound(r.name)) r.name = 'Node Select';
              });
            },

            init() {
              // Watch for changes in rules to update JSON content
              this.$watch('rules', (value) => {
                if (this.mode === 'form') {
                  this.jsonContent = JSON.stringify(value, null, 2);
                }
              });

              // Watch for changes in JSON content to update rules
              this.$watch('jsonContent', (value) => {
                if (this.mode === 'json') {
                  try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) {
                      this.rules = parsed.map(r => ({ __uid: r.__uid || crUid(), ...r }));
                      this.jsonError = null;
                      this.jsonValid = true;
                      setTimeout(() => this.jsonValid = false, 3000);
                    } else {
                      this.jsonError = '${t('mustBeArray')}';
                    }
                  } catch (e) {
                    this.jsonError = e.message;
                  }
                }
              });

              // Listen for custom event to restore rules from URL parsing
              window.addEventListener('restore-custom-rules', (event) => {
                if (event.detail && Array.isArray(event.detail.rules)) {
                  this.rules = event.detail.rules.map(r => ({ __uid: r.__uid || crUid(), ...r }));
                  this.jsonContent = JSON.stringify(this.rules, null, 2);
                  this.mode = 'json'; // Switch to JSON mode to show imported rules
                }
              });

              // Auto-reset invalidated outbound picks
              window.addEventListener('selected-rules-changed', () => this.validateOutbounds());
              window.addEventListener('custom-rulesets-changed', () => {
                this.ruleSetsVersion++;
                this.validateOutbounds();
              });
            },

            addRule() {
              this.rules.push({
                __uid: crUid(),
                name: 'Node Select',
                domain: '',
                domain_suffix: '',
                domain_keyword: '',
                src_ip_cidr: '',
                ip_cidr: '',
                protocol: '',
                site: '',
                ip: '',
                outbound: ''
              });
            },

            removeRule(index) {
              this.rules.splice(index, 1);
            },
            
            clearAll() {
              if (!confirm('${t('confirmClearAllRules')}')) {
                return;
              }
              
              this.$dispatch('custom-rules-clear');
              setTimeout(() => {
                this.rules = [];
                this.jsonContent = '[]';
              }, 200);
            },
            
            validateJson() {
              try {
                const parsed = JSON.parse(this.jsonContent);
                if (Array.isArray(parsed)) {
                  this.rules = parsed;
                  this.jsonError = null;
                  this.jsonValid = true;
                  setTimeout(() => this.jsonValid = false, 3000);
                } else {
                  this.jsonError = '${t('mustBeArray')}';
                }
              } catch (e) {
                this.jsonError = e.message;
              }
            }
          }
        }
      `}} />
    </div>
  );
};
