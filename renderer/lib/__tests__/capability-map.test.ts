import { describe, expect, it } from 'vitest';
import type { CapabilityMapState } from '../../../shared/file-format';
import { groupedSeed, isCategoryInactive, partitionCategories } from '../capability-map';

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

describe('isCategoryInactive', () => {
  it('returns true when the category is toggled off', () => {
    const state = emptyState({ categoryEnabled: { [FIRST.id]: false } });
    expect(isCategoryInactive(state, FIRST.id)).toBe(true);
  });

  it('returns false by default (toggle defaults to on)', () => {
    expect(isCategoryInactive(emptyState(), FIRST.id)).toBe(false);
  });

  it('ignores capability status', () => {
    const first = FIRST_CAPS[0]!;
    const state = emptyState({ capabilityStatus: { [first.id]: 'in-use' } });
    expect(isCategoryInactive(state, FIRST.id)).toBe(false);
  });

  it('still inactive when capabilities have non-default status but toggle is off', () => {
    const first = FIRST_CAPS[0]!;
    const state = emptyState({
      categoryEnabled: { [FIRST.id]: false },
      capabilityStatus: { [first.id]: 'in-use' },
    });
    expect(isCategoryInactive(state, FIRST.id)).toBe(true);
  });
});

describe('partitionCategories', () => {
  it('places every category in active by default', () => {
    const { active, inactive } = partitionCategories(SOLUTION_CATS, emptyState());
    expect(active.length).toBe(SOLUTION_CATS.length);
    expect(inactive.length).toBe(0);
  });

  it('moves a category to inactive when its toggle is off', () => {
    const state = emptyState({ categoryEnabled: { [FIRST.id]: false } });
    const { active, inactive } = partitionCategories(SOLUTION_CATS, state);
    expect(inactive.map((c) => c.id)).toContain(FIRST.id);
    expect(active.map((c) => c.id)).not.toContain(FIRST.id);
  });

  it('does not move a category when only its capability statuses change', () => {
    const cap = FIRST_CAPS[0]!;
    const state = emptyState({ capabilityStatus: { [cap.id]: 'in-use' } });
    const { active, inactive } = partitionCategories(SOLUTION_CATS, state);
    expect(active.map((c) => c.id)).toContain(FIRST.id);
    expect(inactive.map((c) => c.id)).not.toContain(FIRST.id);
  });

  it('respects categoryOrder within each partition', () => {
    const state = emptyState({
      categoryOrder: [SECOND.id, FIRST.id],
    });
    const { active } = partitionCategories(SOLUTION_CATS, state);
    const idsInOrder = active.map((c) => c.id);
    expect(idsInOrder.indexOf(SECOND.id)).toBeLessThan(idsInOrder.indexOf(FIRST.id));
  });

  it('falls back to displayOrder for categories absent from categoryOrder', () => {
    const { active } = partitionCategories(SOLUTION_CATS, emptyState());
    const idsInOrder = active.map((c) => c.id);
    const seedIds = SOLUTION_CATS.map((c) => c.id);
    expect(idsInOrder).toEqual(seedIds);
  });
});
