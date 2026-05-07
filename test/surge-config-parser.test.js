import { describe, expect, it } from 'vitest';
import { parseSurgeConfigInput, convertSurgeIniToJson } from '../src/utils/surgeConfigParser.js';

describe('surge config parser', () => {
    it('returns JSON object untouched when valid JSON is provided', () => {
        const jsonContent = JSON.stringify({
            general: {
                'allow-wifi-access': false,
                'wifi-access-http-port': 6152
            },
            replica: { 'hide-udp': true }
        });

        const result = parseSurgeConfigInput(jsonContent);

        expect(result.convertedFromIni).toBe(false);
        expect(result.configObject.general['allow-wifi-access']).toBe(false);
        expect(result.configObject.replica['hide-udp']).toBe(true);
    });

    it('converts basic Surge INI content into JSON structure', () => {
        const iniContent = `
[General]
allow-wifi-access = false
wifi-access-http-port = 6152
skip-proxy = 127.0.0.1,localhost

[Replica]
hide-udp = true

[Proxy]
DIRECT = direct

[Proxy Group]
Auto = select, DIRECT

[Rule]
DOMAIN-SUFFIX,google.com,Auto
`;

        const { configObject, convertedFromIni } = parseSurgeConfigInput(iniContent);

        expect(convertedFromIni).toBe(true);
        expect(configObject.general['allow-wifi-access']).toBe(false);
        expect(configObject.general['skip-proxy']).toBe('127.0.0.1,localhost');
        expect(configObject.replica['hide-udp']).toBe(true);
        expect(configObject.proxies).toEqual(['DIRECT = direct']);
        expect(configObject['proxy-groups']).toEqual(['Auto = select, DIRECT']);
        expect(configObject.rules).toEqual(['DOMAIN-SUFFIX,google.com,Auto']);
    });

    it('normalizes primitive values within INI sections', () => {
        const iniContent = `
[General]
enabled = true
timeout = 5
ratio = 3.14
quoted = "Text Value"
`;

        const converted = convertSurgeIniToJson(iniContent);

        expect(converted.general.enabled).toBe(true);
        expect(converted.general.timeout).toBe(5);
        expect(converted.general.ratio).toBeCloseTo(3.14);
        expect(converted.general.quoted).toBe('Text Value');
    });

    it('throws when content cannot be parsed as JSON or recognized INI', () => {
        expect(() => parseSurgeConfigInput('invalid content without sections')).toThrow();
    });

    it('accepts a config that contains only [Host]', () => {
        const ini = `[Host]\n*.company.ponte = 127.0.0.1\n`;
        const { configObject, convertedFromIni } = parseSurgeConfigInput(ini);
        expect(convertedFromIni).toBe(true);
        expect(configObject.host).toEqual(['*.company.ponte = 127.0.0.1']);
    });

    it('accepts a config with multiple passthrough sections', () => {
        const ini = `
[Host]
*.company.ponte = 127.0.0.1
mailserver = server 10.0.0.1

[URL Rewrite]
^https?://www\\.example\\.com/old https://www.example.com/new 302

[Header Rewrite]
^https?://example\\.com header-replace User-Agent Surge

[MITM]
hostname = *.example.com
ca-passphrase = secret

[Script]
example-script = type=http-response,pattern=^https://example\\.com,script-path=foo.js

[SSID Setting]
"FreeWiFi" wifi-access = false
`;
        const { configObject } = parseSurgeConfigInput(ini);
        expect(configObject.host).toHaveLength(2);
        expect(configObject['url-rewrite']).toHaveLength(1);
        expect(configObject['header-rewrite']).toHaveLength(1);
        expect(configObject.mitm).toHaveLength(2);
        expect(configObject.script).toHaveLength(1);
        expect(configObject['ssid-setting']).toHaveLength(1);
    });

    it('accepts a config that contains only [Rule] (regression: rules-only was rejected)', () => {
        const ini = `[Rule]\nDOMAIN-SUFFIX,example.com,DIRECT\n`;
        const { configObject } = parseSurgeConfigInput(ini);
        expect(configObject.rules).toEqual(['DOMAIN-SUFFIX,example.com,DIRECT']);
    });
});
