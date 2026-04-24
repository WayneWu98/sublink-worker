import { describe, it, expect } from 'vitest';
import { UNIFIED_RULES, PREDEFINED_RULE_SETS } from '../src/config/rules.js';

describe('Extended rule groups', () => {
  it('adds 15 extended groups to UNIFIED_RULES', () => {
    const extended = UNIFIED_RULES.filter(r => r.extended === true);
    expect(extended.length).toBe(15);
  });

  it('extended groups include Discord, Spotify, Reddit, OpenAI', () => {
    const names = UNIFIED_RULES.filter(r => r.extended).map(r => r.name);
    expect(names).toEqual(expect.arrayContaining(['Discord', 'Spotify', 'Reddit', 'OpenAI', 'Anthropic']));
  });

  it('comprehensive preset excludes extended groups (backward compat)', () => {
    expect(PREDEFINED_RULE_SETS.comprehensive.length).toBe(18);
    const extendedNames = UNIFIED_RULES.filter(r => r.extended).map(r => r.name);
    for (const name of extendedNames) {
      expect(PREDEFINED_RULE_SETS.comprehensive).not.toContain(name);
    }
  });

  it('balanced and minimal presets are unchanged', () => {
    expect(PREDEFINED_RULE_SETS.minimal).toEqual(['Location:CN', 'Private', 'Non-China']);
    expect(PREDEFINED_RULE_SETS.balanced).toEqual(
      ['Location:CN', 'Private', 'Non-China', 'Github', 'Google', 'Youtube', 'AI Services', 'Telegram']
    );
  });

  it('every extended group has at least one site_rules entry', () => {
    UNIFIED_RULES.filter(r => r.extended).forEach(r => {
      expect(r.site_rules.length).toBeGreaterThan(0);
    });
  });
});
