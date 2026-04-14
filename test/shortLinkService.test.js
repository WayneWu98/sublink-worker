import { describe, it, expect } from 'vitest';
import { TokenMismatchError } from '../src/services/errors.js';

describe('TokenMismatchError', () => {
    it('is a 403 error carrying a reason', () => {
        const err = new TokenMismatchError('token required', 'missing');
        expect(err.status).toBe(403);
        expect(err.reason).toBe('missing');
        expect(err.message).toBe('token required');
        expect(err.name).toBe('TokenMismatchError');
    });
});
