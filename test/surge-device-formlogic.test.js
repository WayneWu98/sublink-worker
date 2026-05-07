import { describe, it, expect } from 'vitest';
import { formLogicFn } from '../src/components/formLogic.js';

describe('formLogic — surgeDevices URL persistence', () => {
    const fnString = formLogicFn.toString();

    it('getSubconverterUrl encodes the hidden surgeDevices input into ?surgeDevices=...', () => {
        expect(fnString).toMatch(/input\[name="surgeDevices"\]/);
        expect(fnString).toMatch(/params\.append\(\s*['"]surgeDevices['"]\s*,/);
    });

    it('populateFormFromUrl decodes ?surgeDevices=... and dispatches restore-surge-devices', () => {
        expect(fnString).toMatch(/params\.get\(\s*['"]surgeDevices['"]\s*\)/);
        expect(fnString).toMatch(/['"]restore-surge-devices['"]/);
    });

    it('decodes surgeDevices BEFORE customRuleSets and customRules', () => {
        const surgeIdx = fnString.indexOf("'restore-surge-devices'");
        const ruleSetsIdx = fnString.indexOf("'restore-custom-rule-sets'");
        const rulesIdx = fnString.indexOf("'restore-custom-rules'");
        expect(surgeIdx).toBeGreaterThan(-1);
        expect(ruleSetsIdx).toBeGreaterThan(-1);
        expect(rulesIdx).toBeGreaterThan(-1);
        expect(surgeIdx).toBeLessThan(ruleSetsIdx);
        expect(surgeIdx).toBeLessThan(rulesIdx);
    });

    it('both URL-building paths (getSubconverterUrl AND submitForm) include surgeDevices', () => {
        // Regression: submitForm previously omitted surgeDevices, so the
        // generated /surge link → shorten flow lost the device list. Both
        // independent params builders must read the hidden input.
        const inputReads = fnString.match(/input\[name="surgeDevices"\]/g) || [];
        const paramAppends = fnString.match(/params\.append\(\s*['"]surgeDevices['"]\s*,/g) || [];
        expect(inputReads.length).toBeGreaterThanOrEqual(2);
        expect(paramAppends.length).toBeGreaterThanOrEqual(2);
    });
});
