import { describe, it, expect } from 'vitest';
import {
  STATUSES,
  STATUS_META,
  STATUS_ORDER,
  getCapabilityStatus,
  countCapabilitiesByStatus,
} from '../capability-status';

describe('STATUSES', () => {
  it('lists all six statuses with required fields', () => {
    const ids = STATUSES.map((s) => s.id);
    expect(ids).toEqual([
      'in-use',
      'implementing',
      'planning',
      'not-in-use',
      'no-intent',
      'not-licensed',
    ]);
    for (const s of STATUSES) {
      expect(s.label).toBeTruthy();
      expect(s.color).toMatch(/^var\(--status-/);
      expect(s.description).toBeTruthy();
    }
  });

  it('STATUS_ORDER has six entries, starts with in-use, ends with not-licensed', () => {
    expect(STATUS_ORDER.length).toBe(6);
    expect(STATUS_ORDER[0]).toBe('in-use');
    expect(STATUS_ORDER[STATUS_ORDER.length - 1]).toBe('not-licensed');
  });
});

describe('STATUS_META', () => {
  it('maps every status id to its matching StatusMeta entry', () => {
    for (const s of STATUSES) {
      expect(STATUS_META[s.id]).toBe(s);
    }
  });
});

describe('getCapabilityStatus', () => {
  it('returns the mapped status when present', () => {
    expect(getCapabilityStatus({ foo: 'planning' }, 'foo')).toBe('planning');
  });

  it("defaults to 'not-licensed' when absent", () => {
    expect(getCapabilityStatus({}, 'foo')).toBe('not-licensed');
  });
});

describe('countCapabilitiesByStatus', () => {
  it('counts statuses across given capability ids, defaulting missing to not-licensed', () => {
    const counts = countCapabilitiesByStatus(['a', 'b', 'c', 'd'], {
      a: 'in-use',
      b: 'in-use',
      c: 'planning',
    });
    expect(counts['in-use']).toBe(2);
    expect(counts.planning).toBe(1);
    expect(counts['not-licensed']).toBe(1);
    expect(counts['no-intent']).toBe(0);
    expect(counts.implementing).toBe(0);
    expect(counts['not-in-use']).toBe(0);
  });
});
