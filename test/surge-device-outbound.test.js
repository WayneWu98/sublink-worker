import { describe, it, expect } from 'vitest';
import { isDeviceOutbound } from '../src/builders/BaseConfigBuilder.js';

describe('isDeviceOutbound', () => {
    it('returns true for "DEVICE:tower"', () => {
        expect(isDeviceOutbound('DEVICE:tower')).toBe(true);
    });

    it('returns true for "DEVICE:my-iphone"', () => {
        expect(isDeviceOutbound('DEVICE:my-iphone')).toBe(true);
    });

    it('returns false for "Node Select"', () => {
        expect(isDeviceOutbound('Node Select')).toBe(false);
    });

    it('returns false for "DIRECT"', () => {
        expect(isDeviceOutbound('DIRECT')).toBe(false);
    });

    it('returns false for the empty string', () => {
        expect(isDeviceOutbound('')).toBe(false);
    });

    it('returns false for null/undefined/non-string input', () => {
        expect(isDeviceOutbound(null)).toBe(false);
        expect(isDeviceOutbound(undefined)).toBe(false);
        expect(isDeviceOutbound(42)).toBe(false);
        expect(isDeviceOutbound({})).toBe(false);
    });

    it('is case-sensitive (does not match "device:tower")', () => {
        expect(isDeviceOutbound('device:tower')).toBe(false);
    });
});
