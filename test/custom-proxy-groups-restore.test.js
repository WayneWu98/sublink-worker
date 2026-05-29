import { describe, it, expect } from 'vitest';
import { formLogicFn } from '../src/components/formLogic.js';

describe('formLogic — customProxyGroups round-trip', () => {
    const s = formLogicFn.toString();

    it('both URL builders read the hidden input and append the param', () => {
        const reads = s.match(/input\[name="customProxyGroups"\]/g) || [];
        const appends = s.match(/params\.append\(\s*['"]customProxyGroups['"]\s*,/g) || [];
        expect(reads.length).toBeGreaterThanOrEqual(2);
        expect(appends.length).toBeGreaterThanOrEqual(2);
    });

    it('populateFormFromUrl decodes the param and dispatches restore-custom-proxy-groups', () => {
        expect(s).toMatch(/params\.get\(\s*['"]customProxyGroups['"]\s*\)/);
        expect(s).toMatch(/['"]restore-custom-proxy-groups['"]/);
    });

    it('restores customProxyGroups BEFORE customRuleSets and customRules', () => {
        const cpg = s.indexOf("'restore-custom-proxy-groups'");
        const crs = s.indexOf("'restore-custom-rule-sets'");
        const cr = s.indexOf("'restore-custom-rules'");
        expect(cpg).toBeGreaterThan(-1);
        expect(cpg).toBeLessThan(crs);
        expect(cpg).toBeLessThan(cr);
    });
});
