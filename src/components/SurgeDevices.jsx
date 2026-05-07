/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

export const SurgeDevices = (props) => {
    const { t } = props;

    return (
        <div x-data="surgeDevicesData()" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <i class="fas fa-mobile-alt text-gray-400"></i>
                    {t('surgeDevicesSection')}
                </h3>
            </div>

            <div class="flex flex-col sm:flex-row justify-between items-end sm:items-center mb-6 gap-4">
                <p class="text-sm text-gray-500 dark:text-gray-400">{t('surgeDevicesSectionTooltip')}</p>

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

            {/* Form Mode */}
            <div x-show="mode === 'form'">
                <template x-if="devices.length === 0">
                    <div class="text-center py-12 bg-gray-50 dark:bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <div class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                            <i class="fas fa-plus text-2xl"></i>
                        </div>
                        <p class="text-gray-500 dark:text-gray-400 mb-4">{t('noSurgeDevicesForm')}</p>
                        <button type="button" x-on:click="addDevice()" class="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200 font-medium">
                            {t('addSurgeDevice')}
                        </button>
                    </div>
                </template>

                <div class="space-y-4">
                    <template x-for="(device, index) in devices" x-bind:key="device.__uid || index">
                        <div class="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                            <div class="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                                <h3 class="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                    <span class="w-6 h-6 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs" x-text="index + 1"></span>
                                    {t('surgeDevice')}
                                </h3>
                                <button type="button" x-on:click="removeDevice(index)" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t('surgeDeviceName')}
                                </label>
                                <input type="text" x-model="device.name"
                                    x-on:input="device.name = (device.name || '').replace(/[\s,]+/g, '')"
                                    placeholder="tower"
                                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200" />
                                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('surgeDeviceNameHint')}</p>
                            </div>
                        </div>
                    </template>
                </div>

                <div class="mt-6 flex flex-wrap gap-3">
                    <button type="button" x-on:click="addDevice()" class="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors duration-200 font-medium flex items-center gap-2">
                        <i class="fas fa-plus"></i>
                        {t('addSurgeDevice')}
                    </button>
                    <button type="button" x-on:click="clearAll()" x-show="devices.length > 0" class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors duration-200 font-medium flex items-center gap-2">
                        <i class="fas fa-trash"></i>
                        {t('clearAll')}
                    </button>
                </div>
            </div>

            {/* JSON Mode */}
            <div x-show="mode === 'json'">
                <textarea x-model="jsonContent" rows={8} class="w-full px-4 py-2 font-mono text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder='[{"name":"tower"}]'></textarea>
                <template x-if="jsonError">
                    <p class="mt-2 text-sm text-red-500" x-text="jsonError"></p>
                </template>
            </div>

            {/* Hidden input for form submission */}
            <input type="hidden" name="surgeDevices" x-bind:value="JSON.stringify(devices, (k, v) => k === '__uid' ? undefined : v)" />

            <script dangerouslySetInnerHTML={{
                __html: `
                const sdUid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);

                function surgeDevicesData() {
                    return {
                        mode: 'form',
                        devices: [],
                        jsonContent: '[]',
                        jsonError: null,

                        init() {
                            this.$watch('devices', (value) => {
                                if (this.mode === 'form') {
                                    this.jsonContent = JSON.stringify(value, null, 2);
                                }
                                window.dispatchEvent(new CustomEvent('surge-devices-changed'));
                            });

                            this.$watch('jsonContent', (value) => {
                                if (this.mode === 'json') {
                                    try {
                                        const parsed = JSON.parse(value);
                                        if (Array.isArray(parsed)) {
                                            this.devices = parsed
                                                .map(d => ({ __uid: d.__uid || sdUid(), name: (d.name || '').toString().replace(/[\\s,]+/g, '') }))
                                                .filter(d => d.name);
                                            this.jsonError = null;
                                        } else {
                                            this.jsonError = '${t('mustBeArray')}';
                                        }
                                    } catch (e) {
                                        this.jsonError = e.message;
                                    }
                                }
                            });

                            window.addEventListener('restore-surge-devices', (event) => {
                                if (event.detail && Array.isArray(event.detail.devices)) {
                                    this.devices = event.detail.devices
                                        .map(d => ({ __uid: d.__uid || sdUid(), name: (d.name || '').toString().replace(/[\\s,]+/g, '') }))
                                        .filter(d => d.name);
                                    this.jsonContent = JSON.stringify(this.devices, null, 2);
                                }
                            });
                        },

                        addDevice() {
                            this.devices.push({ __uid: sdUid(), name: '' });
                        },

                        removeDevice(index) {
                            this.devices.splice(index, 1);
                        },

                        clearAll() {
                            if (!confirm('${t('confirmClearAllSurgeDevices')}')) return;
                            this.devices = [];
                            this.jsonContent = '[]';
                        }
                    }
                }
                `
            }} />
        </div>
    );
};
