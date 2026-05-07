export const formLogicFn = (t) => {
    window.formData = function () {
        // Inline parseSurgeConfigInput to make it available in toString()
        const parseSurgeValue = (rawValue = '') => {
            const trimmed = rawValue.trim();
            if (trimmed === '') return '';
            const unquoted = trimmed.replace(/^"(.*)"$/, '$1');
            const lower = unquoted.toLowerCase();
            if (lower === 'true') return true;
            if (lower === 'false') return false;
            if (/^-?\d+(\.\d+)?$/.test(unquoted)) return Number(unquoted);
            return unquoted;
        };

        const convertSurgeIniToJson = (content) => {
            const lines = content.split(/\r?\n/);
            const config = {};
            let currentSection = null;
            const ensureObject = (key) => {
                if (!config[key]) config[key] = {};
                return config[key];
            };
            const ensureArray = (key) => {
                if (!config[key]) config[key] = [];
                return config[key];
            };
            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line || line.startsWith(';') || line.startsWith('#')) continue;
                const sectionMatch = line.match(/^\[(.+)]$/);
                if (sectionMatch) {
                    currentSection = sectionMatch[1].trim();
                    continue;
                }
                if (!currentSection) continue;
                const sectionName = currentSection.toLowerCase();
                if (sectionName === 'general' || sectionName === 'replica') {
                    const equalsIndex = line.indexOf('=');
                    if (equalsIndex === -1) continue;
                    const key = line.slice(0, equalsIndex).trim();
                    const value = line.slice(equalsIndex + 1).trim();
                    if (!key) continue;
                    const target = ensureObject(sectionName);
                    target[key] = parseSurgeValue(value);
                } else if (sectionName === 'proxy') {
                    ensureArray('proxies').push(line);
                } else if (sectionName === 'proxy group') {
                    ensureArray('proxy-groups').push(line);
                } else if (sectionName === 'rule') {
                    ensureArray('rules').push(line);
                } else {
                    ensureArray(sectionName).push(line);
                }
            }
            if (!config.general && !config.replica && !config.proxies && !config['proxy-groups']) {
                throw new Error('Unable to parse Surge INI content');
            }
            return config;
        };

        const parseSurgeConfigInput = (content) => {
            const trimmed = content.trim();
            if (!trimmed) throw new Error('Config content is empty');
            try {
                return { configObject: JSON.parse(trimmed), convertedFromIni: false };
            } catch {
                const converted = convertSurgeIniToJson(content);
                return { configObject: converted, convertedFromIni: true };
            }
        };

        return {
            input: '',
            showAdvanced: false,
            // Accordion states for each section (二级手风琴状态)
            accordionSections: {
                rules: true,        // 规则选择 - 默认展开
                customRules: false, // 自定义规则
                general: false,     // 通用设置
                baseConfig: false,  // 基础配置
                ua: false          // User Agent
            },
            selectedRules: [],
            selectedPredefinedRule: 'balanced',
            subconverterCopied: false,
            groupByCountry: false,
            includeAutoSelect: true,
            enableClashUI: false,
            fallbackOutbound: 'Node Select',
            externalController: '',
            externalUiDownloadUrl: '',
            configType: 'singbox',
            configEditor: '',
            savingConfig: false,
            currentConfigId: '',
            saveConfigText: '',
            savingConfigText: '',
            configContentRequiredText: '',
            configSaveFailedText: '',
            configValidationState: '',
            configValidationMessage: '',
            customUA: '',
            loading: false,
            generatedLinks: null,
            shortenedLinks: null,
            shortening: false,
            customShortCode: '',
            shortCodeToken: '',
            issuedShortCodeToken: '',
            showLoadModal: false,
            loadCodeInput: '',
            loadTokenInput: '',
            loadingFromCode: false,
            loadError: '',
            parsingUrl: false,
            parseDebounceTimer: null,
            // These will be populated from window.APP_TRANSLATIONS
            processingText: '',
            convertText: '',
            shortenLinksText: '',
            shorteningText: '',
            showFullLinksText: '',

            init() {
                // Load translations
                if (window.APP_TRANSLATIONS) {
                    this.processingText = window.APP_TRANSLATIONS.processing;
                    this.convertText = window.APP_TRANSLATIONS.convert;
                    this.shortenLinksText = window.APP_TRANSLATIONS.shortenLinks;
                    this.shorteningText = window.APP_TRANSLATIONS.shortening;
                    this.showFullLinksText = window.APP_TRANSLATIONS.showFullLinks;
                    this.saveConfigText = window.APP_TRANSLATIONS.saveConfig;
                    this.savingConfigText = window.APP_TRANSLATIONS.savingConfig;
                    this.configContentRequiredText = window.APP_TRANSLATIONS.configContentRequired;
                    this.configSaveFailedText = window.APP_TRANSLATIONS.configSaveFailed;
                }

                // Load saved data
                this.input = localStorage.getItem('inputTextarea') || '';
                this.showAdvanced = localStorage.getItem('advancedToggle') === 'true';
                this.groupByCountry = localStorage.getItem('groupByCountry') === 'true';
                this.includeAutoSelect = localStorage.getItem('includeAutoSelect') !== 'false';
                this.enableClashUI = localStorage.getItem('enableClashUI') === 'true';
                const savedFbo = localStorage.getItem('fallbackOutbound');
                this.fallbackOutbound = ['Node Select', 'DIRECT', 'REJECT'].includes(savedFbo) ? savedFbo : 'Node Select';
                this.externalController = localStorage.getItem('externalController') || '';
                this.externalUiDownloadUrl = localStorage.getItem('externalUiDownloadUrl') || '';
                this.customUA = localStorage.getItem('userAgent') || '';
                this.configEditor = localStorage.getItem('configEditor') || '';
                this.configType = localStorage.getItem('configType') || 'singbox';
                this.customShortCode = localStorage.getItem('customShortCode') || '';
                const initialUrlParams = new URLSearchParams(window.location.search);
                this.currentConfigId = initialUrlParams.get('configId') || '';

                // Load accordion states
                const savedAccordion = localStorage.getItem('accordionSections');
                if (savedAccordion) {
                    try {
                        this.accordionSections = JSON.parse(savedAccordion);
                    } catch (e) {
                        // If parsing fails, keep defaults
                    }
                }

                // Initialize rules
                this.applyPredefinedRule();

                // Watchers to save state
                this.$watch('input', val => {
                    localStorage.setItem('inputTextarea', val);
                    this.handleInputChange(val);
                });
                this.$watch('showAdvanced', val => localStorage.setItem('advancedToggle', val));
                this.$watch('groupByCountry', val => localStorage.setItem('groupByCountry', val));
                this.$watch('includeAutoSelect', val => localStorage.setItem('includeAutoSelect', val));
                this.$watch('enableClashUI', val => localStorage.setItem('enableClashUI', val));
                this.$watch('fallbackOutbound', val => localStorage.setItem('fallbackOutbound', val));
                this.$watch('selectedRules', () => window.dispatchEvent(new Event('selected-rules-changed')));
                this.$watch('externalController', val => localStorage.setItem('externalController', val));
                this.$watch('externalUiDownloadUrl', val => localStorage.setItem('externalUiDownloadUrl', val));
                this.$watch('customUA', val => localStorage.setItem('userAgent', val));
                this.$watch('configEditor', val => {
                    localStorage.setItem('configEditor', val);
                    this.resetConfigValidation();
                });
                this.$watch('configType', val => {
                    localStorage.setItem('configType', val);
                    this.resetConfigValidation();
                });
                this.$watch('customShortCode', val => localStorage.setItem('customShortCode', val));
                this.$watch('accordionSections', val => localStorage.setItem('accordionSections', JSON.stringify(val)), { deep: true });
            },

            toggleAccordion(section) {
                this.accordionSections[section] = !this.accordionSections[section];
            },

            applyPredefinedRule() {
                if (this.selectedPredefinedRule === 'custom') return;

                // PREDEFINED_RULE_SETS will be injected globally
                const rules = window.PREDEFINED_RULE_SETS;
                if (rules && rules[this.selectedPredefinedRule]) {
                    this.selectedRules = rules[this.selectedPredefinedRule];
                }
            },

            getSubconverterUrl() {
                const origin = window.location.origin;
                const params = new URLSearchParams();

                // Use preset name directly if a predefined rule set is selected
                if (this.selectedPredefinedRule && this.selectedPredefinedRule !== 'custom') {
                    params.append('selectedRules', this.selectedPredefinedRule);
                } else if (this.selectedPredefinedRule === 'custom') {
                    params.append('selectedRules', JSON.stringify(this.selectedRules));
                }

                // Include customRules when available (best-effort; may make URL long)
                try {
                    const customRulesInput = document.querySelector('input[name="customRules"]');
                    const customRules = customRulesInput && customRulesInput.value ? JSON.parse(customRulesInput.value) : [];
                    if (Array.isArray(customRules) && customRules.length > 0) {
                        params.append('customRules', JSON.stringify(customRules));
                    }
                } catch { }

                // Include customRuleSets when available
                try {
                    const customRuleSetsInput = document.querySelector('input[name="customRuleSets"]');
                    const customRuleSets = customRuleSetsInput && customRuleSetsInput.value ? JSON.parse(customRuleSetsInput.value) : [];
                    if (Array.isArray(customRuleSets) && customRuleSets.length > 0) {
                        params.append('customRuleSets', JSON.stringify(customRuleSets));
                    }
                } catch { }

                // Include surgeDevices when available
                try {
                    const surgeDevicesInput = document.querySelector('input[name="surgeDevices"]');
                    const surgeDevices = surgeDevicesInput && surgeDevicesInput.value ? JSON.parse(surgeDevicesInput.value) : [];
                    if (Array.isArray(surgeDevices) && surgeDevices.length > 0) {
                        params.append('surgeDevices', JSON.stringify(surgeDevices));
                    }
                } catch { }

                if (!this.includeAutoSelect) {
                    params.append('include_auto_select', 'false');
                }

                if (this.groupByCountry) {
                    params.append('group_by_country', 'true');
                }

                if (this.fallbackOutbound && this.fallbackOutbound !== 'Node Select') {
                    params.append('fallback_outbound', this.fallbackOutbound);
                }

                // Include lang parameter so subconverter gets correct group names
                const appLang = window.APP_LANG || 'zh-CN';
                if (appLang !== 'zh-CN') {
                    params.append('lang', appLang);
                }

                const queryString = params.toString();
                return origin + '/subconverter' + (queryString ? '?' + queryString : '');
            },

            copySubconverterUrl() {
                const url = this.getSubconverterUrl();
                navigator.clipboard.writeText(url).then(() => {
                    this.subconverterCopied = true;
                    setTimeout(() => this.subconverterCopied = false, 2000);
                }).catch(() => {});
            },

            resetConfigValidation() {
                this.configValidationState = '';
                this.configValidationMessage = '';
            },

            async saveBaseConfig() {
                const content = (this.configEditor || '').trim();
                if (!content) {
                    alert(this.configContentRequiredText || window.APP_TRANSLATIONS.configContentRequired);
                    return;
                }

                let payloadContent = this.configEditor;
                if (this.configType === 'surge') {
                    try {
                        const { configObject } = parseSurgeConfigInput(this.configEditor);
                        payloadContent = JSON.stringify(configObject);
                    } catch (parseError) {
                        const prefix = window.APP_TRANSLATIONS.configValidationError || 'Config validation error:';
                        alert(`${prefix} ${parseError?.message || ''}`.trim());
                        return;
                    }
                }

                this.savingConfig = true;
                try {
                    const response = await fetch('/config', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            type: this.configType,
                            content: payloadContent
                        })
                    });
                    const responseText = await response.text();
                    if (!response.ok) {
                        throw new Error(responseText || response.statusText || 'Request failed');
                    }
                    const configId = responseText.trim();
                    if (!configId) {
                        throw new Error('Missing config ID');
                    }
                    this.currentConfigId = configId;
                    this.updateConfigIdInUrl(configId);

                    const successMessage = window.APP_TRANSLATIONS.saveConfigSuccess || 'Configuration saved successfully!';
                    alert(`${successMessage}\nID: ${configId}`);
                } catch (error) {
                    console.error('Failed to save base config:', error);
                    const errorPrefix = this.configSaveFailedText || window.APP_TRANSLATIONS.configSaveFailed || 'Failed to save configuration';
                    alert(`${errorPrefix}: ${error?.message || 'Unknown error'}`);
                } finally {
                    this.savingConfig = false;
                }
            },

            validateBaseConfig() {
                const content = (this.configEditor || '').trim();
                if (!content) {
                    this.configValidationState = 'error';
                    this.configValidationMessage = this.configContentRequiredText || window.APP_TRANSLATIONS.configContentRequired;
                    return;
                }

                try {
                    if (this.configType === 'clash') {
                        if (!window.jsyaml || !window.jsyaml.load) {
                            throw new Error(window.APP_TRANSLATIONS.parserUnavailable || 'Parser unavailable. Please refresh and try again.');
                        }
                        window.jsyaml.load(content);
                        this.configValidationState = 'success';
                        this.configValidationMessage =
                            window.APP_TRANSLATIONS.validYamlConfig || 'YAML config is valid';
                    } else if (this.configType === 'surge') {
                        parseSurgeConfigInput(this.configEditor);
                        this.configValidationState = 'success';
                        this.configValidationMessage =
                            window.APP_TRANSLATIONS.validJsonConfig || 'JSON config is valid';
                    } else {
                        JSON.parse(content);
                        this.configValidationState = 'success';
                        this.configValidationMessage =
                            window.APP_TRANSLATIONS.validJsonConfig || 'JSON config is valid';
                    }
                } catch (error) {
                    this.configValidationState = 'error';
                    const prefix = window.APP_TRANSLATIONS.configValidationError || 'Config validation error: ';
                    this.configValidationMessage = `${prefix}${error?.message || ''}`;
                }
            },

            clearBaseConfig() {
                if (confirm(window.APP_TRANSLATIONS.confirmClearConfig)) {
                    this.configEditor = '';
                    localStorage.removeItem('configEditor');
                    this.currentConfigId = '';
                    this.updateConfigIdInUrl(null);
                }
            },

            clearAll() {
                if (confirm(window.APP_TRANSLATIONS.confirmClearAll)) {
                    this.input = '';
                    this.generatedLinks = null;
                    this.shortenedLinks = null;
                    this.customShortCode = '';
                    this.shortCodeToken = '';
                    this.issuedShortCodeToken = '';
                    // Also clear from localStorage
                    localStorage.removeItem('customShortCode');
                }
            },

            updateConfigIdInUrl(configId) {
                const url = new URL(window.location.href);
                if (configId) {
                    url.searchParams.set('configId', configId);
                } else {
                    url.searchParams.delete('configId');
                }
                window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
            },

            async submitForm() {
                this.loading = true;
                this.shortenedLinks = null; // Reset shortened links when generating new links
                try {
                    // Get custom rules from the child component via the hidden input
                    const customRulesInput = document.querySelector('input[name="customRules"]');
                    const customRules = customRulesInput && customRulesInput.value ? JSON.parse(customRulesInput.value) : [];

                    // Get custom rule-sets from the child component via the hidden input
                    const customRuleSetsInput = document.querySelector('input[name="customRuleSets"]');
                    const customRuleSets = customRuleSetsInput && customRuleSetsInput.value ? JSON.parse(customRuleSetsInput.value) : [];

                    // Construct URLs
                    const origin = window.location.origin;
                    const params = new URLSearchParams();
                    params.append('config', this.input);
                    params.append('ua', this.customUA);
                    params.append('selectedRules', JSON.stringify(this.selectedRules));
                    params.append('customRules', JSON.stringify(customRules));
                    if (Array.isArray(customRuleSets) && customRuleSets.length > 0) {
                        params.append('customRuleSets', JSON.stringify(customRuleSets));
                    }

                    if (this.groupByCountry) params.append('group_by_country', 'true');
                    if (!this.includeAutoSelect) params.append('include_auto_select', 'false');
                    if (this.enableClashUI) params.append('enable_clash_ui', 'true');
                    if (this.fallbackOutbound && this.fallbackOutbound !== 'Node Select') {
                        params.append('fallback_outbound', this.fallbackOutbound);
                    }
                    if (this.externalController) params.append('external_controller', this.externalController);
                    if (this.externalUiDownloadUrl) params.append('external_ui_download_url', this.externalUiDownloadUrl);

                    // Add configId if present in URL
                    const urlParams = new URLSearchParams(window.location.search);
                    const configId = this.currentConfigId || urlParams.get('configId');
                    if (configId) {
                        params.append('configId', configId);
                    }

                    const queryString = params.toString();

                    this.generatedLinks = {
                        xray: origin + '/xray?' + queryString,
                        singbox: origin + '/singbox?' + queryString,
                        clash: origin + '/clash?' + queryString,
                        surge: origin + '/surge?' + queryString
                    };

                    // Scroll to results
                    setTimeout(() => {
                        const resultsDiv = document.querySelector('.mt-12');
                        if (resultsDiv) {
                            resultsDiv.scrollIntoView({ behavior: 'smooth' });
                        }
                    }, 100);

                } catch (error) {
                    console.error('Error generating links:', error);
                    alert(window.APP_TRANSLATIONS.errorGeneratingLinks);
                } finally {
                    this.loading = false;
                }
            },

            async shortenLinks() {
                if (this.shortenedLinks) {
                    alert(window.APP_TRANSLATIONS.alreadyShortened);
                    return;
                }
                if (!this.generatedLinks) {
                    return;
                }

                this.shortening = true;
                try {
                    const origin = window.location.origin;
                    // All 4 types (singbox/clash/xray/surge) share the same query string,
                    // so a single backend call is enough. Prefixes are applied locally.
                    const firstType = Object.keys(this.generatedLinks)[0];
                    const representativeUrl = this.generatedLinks[firstType];
                    const customCode = this.customShortCode.trim();
                    const providedToken = this.shortCodeToken.trim();

                    let apiUrl = origin + '/shorten-v2?url=' + encodeURIComponent(representativeUrl);
                    if (customCode) {
                        apiUrl += '&shortCode=' + encodeURIComponent(customCode);
                    }
                    const headers = {};
                    if (providedToken) {
                        headers['X-Shortlink-Token'] = providedToken;
                    }

                    const response = await fetch(apiUrl, { headers });
                    const body = await response.json().catch(() => ({}));

                    if (!response.ok) {
                        const msg = body.error || window.APP_TRANSLATIONS.shortenFailed;
                        alert(msg);
                        return;
                    }

                    const { code, token } = body;
                    this.issuedShortCodeToken = token;

                    const prefixMap = { singbox: 'b', clash: 'c', xray: 'x', surge: 's' };
                    const shortened = {};
                    for (const type of Object.keys(this.generatedLinks)) {
                        shortened[type] = origin + '/' + prefixMap[type] + '/' + code;
                    }
                    this.shortenedLinks = shortened;
                } catch (error) {
                    console.error('Error shortening links:', error);
                    alert(window.APP_TRANSLATIONS.shortenFailed);
                } finally {
                    this.shortening = false;
                }
            },

            // Handle input change with debounce
            handleInputChange(val) {
                // Clear previous timer
                if (this.parseDebounceTimer) {
                    clearTimeout(this.parseDebounceTimer);
                }

                // If input is empty, don't try to parse
                if (!val || !val.trim()) {
                    return;
                }

                // Debounce for 500ms
                this.parseDebounceTimer = setTimeout(() => {
                    this.tryParseSubscriptionUrl(val.trim());
                }, 500);
            },

            // Check if input looks like a full subscription URL (short URLs are no longer auto-resolved).
            isSubscriptionUrl(text) {
                if (text.includes('\n')) {
                    return false;
                }

                try {
                    const url = new URL(text);
                    const fullMatch = url.pathname.match(/^\/(singbox|clash|xray|surge)$/);
                    return !!(fullMatch && url.search);
                } catch {
                    return false;
                }
            },

            // Try to parse a full subscription URL (short URLs are no longer auto-resolved).
            async tryParseSubscriptionUrl(text) {
                if (!this.isSubscriptionUrl(text)) {
                    return;
                }

                this.parsingUrl = true;
                try {
                    let urlToParse;
                    try {
                        urlToParse = new URL(text);
                    } catch {
                        return;
                    }

                    this.populateFormFromUrl(urlToParse);

                    const message = window.APP_TRANSLATIONS?.urlParsedSuccess || '已成功解析订阅链接配置';
                    console.log(message);
                } catch (error) {
                    console.error('Error parsing subscription URL:', error);
                } finally {
                    this.parsingUrl = false;
                }
            },

            // Populate form fields from parsed URL
            populateFormFromUrl(url) {
                const params = new URLSearchParams(url.search);

                // Extract config (the original subscription URLs)
                const config = params.get('config');
                if (config) {
                    this.input = config;
                }

                // Extract selectedRules
                const selectedRules = params.get('selectedRules');
                if (selectedRules) {
                    try {
                        const parsed = JSON.parse(selectedRules);
                        if (Array.isArray(parsed)) {
                            this.selectedRules = parsed;
                            this.selectedPredefinedRule = 'custom';
                        }
                    } catch (e) {
                        console.warn('Failed to parse selectedRules:', e);
                    }
                }

                // Extract surgeDevices first — declarations must land in the DOM before
                // any consumer's validateOutbounds() runs, otherwise DEVICE:xxx values
                // would be silently rejected and reset to Node Select.
                const surgeDevices = params.get('surgeDevices');
                if (surgeDevices) {
                    try {
                        const parsed = JSON.parse(surgeDevices);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            window.dispatchEvent(new CustomEvent('restore-surge-devices', {
                                detail: { devices: parsed }
                            }));
                        }
                    } catch (e) {
                        console.warn('Failed to parse surgeDevices:', e);
                    }
                }

                // Extract customRuleSets (after surgeDevices so its outbound dropdown sees devices)
                const customRuleSets = params.get('customRuleSets');
                if (customRuleSets) {
                    try {
                        const parsed = JSON.parse(customRuleSets);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            window.dispatchEvent(new CustomEvent('restore-custom-rule-sets', {
                                detail: { rules: parsed }
                            }));
                        }
                    } catch (e) {
                        console.warn('Failed to parse customRuleSets:', e);
                    }
                }

                // Extract customRules (last so it can reference both surgeDevices and customRuleSets)
                const customRules = params.get('customRules');
                if (customRules) {
                    try {
                        const parsed = JSON.parse(customRules);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            // Dispatch custom event for CustomRules component to listen
                            window.dispatchEvent(new CustomEvent('restore-custom-rules', {
                                detail: { rules: parsed }
                            }));
                        }
                    } catch (e) {
                        console.warn('Failed to parse customRules:', e);
                    }
                }

                // Extract other parameters
                this.groupByCountry = params.get('group_by_country') === 'true';
                this.includeAutoSelect = params.get('include_auto_select') !== 'false';
                this.enableClashUI = params.get('enable_clash_ui') === 'true';
                const fbo = params.get('fallback_outbound');
                if (fbo && ['Node Select', 'DIRECT', 'REJECT'].includes(fbo)) {
                    this.fallbackOutbound = fbo;
                }

                const externalController = params.get('external_controller');
                if (externalController) {
                    this.externalController = externalController;
                }

                const externalUiDownloadUrl = params.get('external_ui_download_url');
                if (externalUiDownloadUrl) {
                    this.externalUiDownloadUrl = externalUiDownloadUrl;
                }

                const ua = params.get('ua');
                if (ua) {
                    this.customUA = ua;
                }

                const configId = params.get('configId');
                if (configId) {
                    this.currentConfigId = configId;
                    this.updateConfigIdInUrl(configId);
                }

                // Expand advanced options if any advanced settings are present
                if (selectedRules || customRules || customRuleSets || this.groupByCountry || this.enableClashUI ||
                    externalController || externalUiDownloadUrl || ua || configId) {
                    this.showAdvanced = true;
                }
            },

            openLoadModal() {
                this.showLoadModal = true;
                this.loadCodeInput = '';
                this.loadTokenInput = '';
                this.loadError = '';
            },

            closeLoadModal() {
                this.showLoadModal = false;
                this.loadError = '';
            },

            async loadFromShortCode() {
                const code = this.loadCodeInput.trim();
                const token = this.loadTokenInput.trim();
                if (!code) {
                    this.loadError = window.APP_TRANSLATIONS?.loadShortCodeMissingFields || 'Short code is required';
                    return;
                }

                this.loadingFromCode = true;
                this.loadError = '';
                try {
                    const origin = window.location.origin;
                    const shortUrl = origin + '/b/' + encodeURIComponent(code);
                    const headers = token ? { 'X-Shortlink-Token': token } : {};
                    const response = await fetch('/resolve?url=' + encodeURIComponent(shortUrl), { headers });

                    if (response.status === 401) {
                        this.loadError = window.APP_TRANSLATIONS?.loadShortCodeMissingToken || 'Token required';
                        return;
                    }
                    if (response.status === 403) {
                        this.loadError = window.APP_TRANSLATIONS?.loadShortCodeTokenMismatch || 'Token does not match';
                        return;
                    }
                    if (response.status === 404) {
                        this.loadError = window.APP_TRANSLATIONS?.loadShortCodeNotFound || 'Short code not found';
                        return;
                    }
                    if (!response.ok) {
                        this.loadError = window.APP_TRANSLATIONS?.loadShortCodeFailed || 'Failed to load';
                        return;
                    }

                    const data = await response.json();
                    if (!data || !data.originalUrl) {
                        this.loadError = window.APP_TRANSLATIONS?.loadShortCodeFailed || 'Failed to load';
                        return;
                    }

                    this.populateFormFromUrl(new URL(data.originalUrl));
                    this.customShortCode = code;
                    this.shortCodeToken = token;
                    this.showLoadModal = false;
                } catch (error) {
                    console.error('Error loading from short code:', error);
                    this.loadError = window.APP_TRANSLATIONS?.loadShortCodeFailed || 'Failed to load';
                } finally {
                    this.loadingFromCode = false;
                }
            }
        }
    }
};
