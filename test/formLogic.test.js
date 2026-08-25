import { describe, it, expect } from 'vitest';
import { formLogicFn } from '../src/components/formLogic.js';

describe('formLogic toString fix', () => {
  it('includes parseSurgeConfigInput definition in toString output', () => {
    const fnString = formLogicFn.toString();

    // Verify the function references parseSurgeConfigInput
    expect(fnString).toContain('parseSurgeConfigInput');

    // Verify the arrow function definitions ARE included
    expect(fnString).toMatch(/(?:const|var|let)\s+parseSurgeConfigInput\s*=/);
    expect(fnString).toMatch(/(?:const|var|let)\s+parseSurgeValue\s*=/);
    expect(fnString).toMatch(/(?:const|var|let)\s+convertSurgeIniToJson\s*=/);
  });

  it('does not contain __name calls that break in browser runtime', () => {
    const fnString = formLogicFn.toString();
    // Ensure no function declarations that esbuild would inject __name() for
    expect(fnString).not.toMatch(/^\s*function\s+parseSurgeValue\b/m);
    expect(fnString).not.toMatch(/^\s*function\s+convertSurgeIniToJson\b/m);
    expect(fnString).not.toMatch(/^\s*function\s+parseSurgeConfigInput\b/m);
  });

  it('formData() returns a valid Alpine data object', () => {
    // Simulate browser global environment using Function constructor
    const fakeWindow = { APP_TRANSLATIONS: {}, PREDEFINED_RULE_SETS: {} };
    const fn = new Function('window', '(' + formLogicFn.toString() + ')(); return window;');
    const result = fn(fakeWindow);
    const data = result.formData();
    expect(typeof data.submitForm).toBe('function');
    expect(typeof data.toggleAccordion).toBe('function');
    expect(data.showAdvanced).toBe(false);
  });

  it('preserves Ponte when saving an INI Surge base config', async () => {
    const requests = [];
    const fakeWindow = {
      APP_TRANSLATIONS: { saveConfigSuccess: 'Saved' },
      PREDEFINED_RULE_SETS: {},
      location: { href: 'https://example.com/', search: '' },
      history: { replaceState() {} }
    };
    const fakeFetch = async (url, options) => {
      requests.push({ url, options });
      return { ok: true, text: async () => 'surge_test' };
    };
    const fn = new Function(
      'window',
      'fetch',
      'alert',
      '(' + formLogicFn.toString() + ')(); return window;'
    );
    const result = fn(fakeWindow, fakeFetch, () => {});
    const data = result.formData();
    data.configType = 'surge';
    data.configEditor = [
      '[General]',
      'leading-zero = "001"',
      '#!include General.dconf',
      '',
      '[Ponte]',
      'client-proxy-name = Relay-Proxy',
      '',
      '[WireGuard Home]',
      'private-key = example'
    ].join('\n');

    await data.saveBaseConfig();

    expect(requests).toHaveLength(1);
    const requestBody = JSON.parse(requests[0].options.body);
    const savedConfig = JSON.parse(requestBody.content);
    expect(savedConfig['general-lines']).toEqual([
      'leading-zero = "001"',
      '#!include General.dconf'
    ]);
    expect(savedConfig.ponte).toEqual([
      'client-proxy-name = Relay-Proxy'
    ]);
    expect(savedConfig['passthrough-sections']).toEqual([
      { name: 'WireGuard Home', lines: ['private-key = example'] }
    ]);
  });

  it('no longer contains the short-URL auto-parse branch', () => {
    const fnString = formLogicFn.toString();
    expect(fnString).not.toMatch(/\/\^\\\/\(\[bcxs\]\)\\\/\(\[a-zA-Z0-9_-\]\+\)\$/);
    expect(fnString).not.toContain("fetch(`/resolve?url=${encodeURIComponent(text)}`)");
  });

  it('exposes modal state and loadFromShortCode handler', () => {
    const fakeWindow = { APP_TRANSLATIONS: {}, PREDEFINED_RULE_SETS: {} };
    const fn = new Function('window', '(' + formLogicFn.toString() + ')(); return window;');
    const result = fn(fakeWindow);
    const data = result.formData();
    expect(data.showLoadModal).toBe(false);
    expect(data.loadCodeInput).toBe('');
    expect(data.loadTokenInput).toBe('');
    expect(data.loadingFromCode).toBe(false);
    expect(data.loadError).toBe('');
    expect(typeof data.loadFromShortCode).toBe('function');
    expect(typeof data.openLoadModal).toBe('function');
    expect(typeof data.closeLoadModal).toBe('function');
  });
});
