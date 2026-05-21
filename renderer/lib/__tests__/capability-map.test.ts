import { describe, expect, it } from 'vitest';
import type { CapabilityMapState } from '../../../shared/file-format';
import { groupedSeed, isCategoryUnlicensed, partitionCategories } from '../capability-map';

const SOLUTION_CATS = groupedSeed.solutionCategories;
const FIRST = SOLUTION_CATS[0]!;
const SECOND = SOLUTION_CATS[1]!;
const FIRST_CAPS = groupedSeed.capabilitiesByCategory.get(FIRST.id) ?? [];

function emptyState(overrides: Partial<CapabilityMapState> = {}): CapabilityMapState {
  return {
    categoryEnabled: {},
    capabilityStatus: {},
    capabilityNotes: {},
    categoryOrder: [],
    ...overrides,
  };
}

describe('isCategoryUnlicensed', () => {
  it('returns true when the category is toggled off', () => {
    const state = emptyState({ categoryEnabled: { [FIRST.id]: false } });
    expect(isCategoryUnlicensed(state, FIRST.id, FIRST_CAPS)).toBe(true);
  });

  it('returns true by default (all capabilities implicitly not-licensed)', () => {
    expect(isCategoryUnlicensed(emptyState(), FIRST.id, FIRST_CAPS)).toBe(true);
  });

  it('returns false once any capability has a non not-licensed status', () => {
    const first = FIRST_CAPS[0]!;
    const state = emptyState({ capabilityStatus: { [first.id]: 'in-use' } });
    expect(isCategoryUnlicensed(state, FIRST.id, FIRST_CAPS)).toBe(false);
  });

  it('toggle-off wins over any capability status', () => {
    const first = FIRST_CAPS[0]!;
    const state = emptyState({
      categoryEnabled: { [FIRST.id]: false },
      capabilityStatus: { [first.id]: 'in-use' },
    });
    expect(isCategoryUnlicensed(state, FIRST.id, FIRST_CAPS)).toBe(true);
  });
});

describe('partitionCategories', () => {
  it('places every category in unlicensed by default', () => {
    const { active, unlicensed } = partitionCategories(SOLUTION_CATS, emptyState());
    expect(active.length).toBe(0);
    expect(unlicensed.length).toBe(SOLUTION_CATS.length);
  });

  it('moves a category to active once one of its capabilities is not "not-licensed"', () => {
    const cap = FIRST_CAPS[0]!;
    const state = emptyState({ capabilityStatus: { [cap.id]: 'planning' } });
    const { active, unlicensed } = partitionCategories(SOLUTION_CATS, state);
    expect(active.map((c) => c.id)).toContain(FIRST.id);
    expect(unlicensed.map((c) => c.id)).not.toContain(FIRST.id);
  });

  it('respects categoryOrder within each partition', () => {
    const firstCap = FIRST_CAPS[0]!;
    const secondCaps = groupedSeed.capabilitiesByCategory.get(SECOND.id) ?? [];
    const secondCap = secondCaps[0]!;
    const state = emptyState({
      capabilityStatus: { [firstCap.id]: 'in-use', [secondCap.id]: 'in-use' },
      categoryOrder: [SECOND.id, FIRST.id],
    });
    const { active } = partitionCategories(SOLUTION_CATS, state);
    const idsInOrder = active.map((c) => c.id);
    expect(idsInOrder.indexOf(SECOND.id)).toBeLessThan(idsInOrder.indexOf(FIRST.id));
  });

  it('falls back to displayOrder for categories absent from categoryOrder', () => {
    const { unlicensed } = partitionCategories(SOLUTION_CATS, emptyState());
    const idsInOrder = unlicensed.map((c) => c.id);
    const seedIds = SOLUTION_CATS.map((c) => c.id);
    expect(idsInOrder).toEqual(seedIds);
  });
});
