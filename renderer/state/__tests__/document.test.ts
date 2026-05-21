import { describe, it, expect, beforeEach } from 'vitest';
import { useDocumentStore } from '../document';
import { emptyDocument } from '../../../shared/file-format';
import { groupedSeed } from '../../lib/capability-map';

function reset() {
  useDocumentStore.setState({
    currentDocument: emptyDocument(),
    currentFilePath: null,
    isDirty: false,
    lastSavedAt: null,
  });
}

describe('setCapabilityStatus', () => {
  beforeEach(reset);

  it('sets a capability status and marks dirty', () => {
    useDocumentStore.getState().setCapabilityStatus('incident-mgmt', 'planning');
    const s = useDocumentStore.getState();
    expect(s.currentDocument?.capabilityMap.capabilityStatus['incident-mgmt']).toBe('planning');
    expect(s.isDirty).toBe(true);
  });

  it('is a no-op when status is unchanged', () => {
    useDocumentStore.getState().setCapabilityStatus('x', 'in-use');
    useDocumentStore.setState({ isDirty: false });
    useDocumentStore.getState().setCapabilityStatus('x', 'in-use');
    expect(useDocumentStore.getState().isDirty).toBe(false);
  });
});

describe('setCapabilityNotes', () => {
  beforeEach(reset);

  it('writes notes and marks dirty', () => {
    useDocumentStore.getState().setCapabilityNotes('change-mgmt', 'Q3 rollout');
    expect(
      useDocumentStore.getState().currentDocument?.capabilityMap.capabilityNotes['change-mgmt'],
    ).toBe('Q3 rollout');
    expect(useDocumentStore.getState().isDirty).toBe(true);
  });

  it('deletes the key when notes are empty', () => {
    useDocumentStore.getState().setCapabilityNotes('x', 'hi');
    useDocumentStore.getState().setCapabilityNotes('x', '');
    expect(
      useDocumentStore.getState().currentDocument?.capabilityMap.capabilityNotes.x,
    ).toBeUndefined();
  });
});

describe('setCategoryCapabilityStatuses', () => {
  beforeEach(reset);

  it('applies status to every provided capability id', () => {
    useDocumentStore.getState().setCategoryCapabilityStatuses(['a', 'b', 'c'], 'planning');
    const map = useDocumentStore.getState().currentDocument!.capabilityMap.capabilityStatus;
    expect(map).toEqual({ a: 'planning', b: 'planning', c: 'planning' });
    expect(useDocumentStore.getState().isDirty).toBe(true);
  });

  it('is a no-op for an empty id list', () => {
    useDocumentStore.getState().setCategoryCapabilityStatuses([], 'in-use');
    expect(useDocumentStore.getState().isDirty).toBe(false);
  });
});

describe('setCategoryOrder', () => {
  beforeEach(reset);

  it('replaces the order and marks dirty', () => {
    useDocumentStore.getState().setCategoryOrder(['a', 'b', 'c']);
    expect(useDocumentStore.getState().currentDocument!.capabilityMap.categoryOrder).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(useDocumentStore.getState().isDirty).toBe(true);
  });

  it('is a no-op when the order is identical', () => {
    useDocumentStore.getState().setCategoryOrder(['a', 'b']);
    useDocumentStore.setState({ isDirty: false });
    useDocumentStore.getState().setCategoryOrder(['a', 'b']);
    expect(useDocumentStore.getState().isDirty).toBe(false);
  });
});

describe('section transitions reposition categoryOrder', () => {
  beforeEach(reset);

  const FIRST = groupedSeed.solutionCategories[0]!;
  const SECOND = groupedSeed.solutionCategories[1]!;
  const FIRST_CAP = (groupedSeed.capabilitiesByCategory.get(FIRST.id) ?? [])[0]!;
  const SECOND_CAP = (groupedSeed.capabilitiesByCategory.get(SECOND.id) ?? [])[0]!;

  it('sends a category to the end of categoryOrder when toggled off', () => {
    // First, give both cats some non-unlicensed status so they're Active.
    useDocumentStore.getState().setCapabilityStatus(FIRST_CAP.id, 'in-use');
    useDocumentStore.getState().setCapabilityStatus(SECOND_CAP.id, 'in-use');
    useDocumentStore.getState().setCategoryEnabled(FIRST.id, false);
    const order = useDocumentStore.getState().currentDocument!.capabilityMap.categoryOrder;
    expect(order[order.length - 1]).toBe(FIRST.id);
  });

  it('returns a category to the end of the Active segment when re-activated', () => {
    // Both Active, FIRST listed before SECOND
    useDocumentStore.getState().setCapabilityStatus(FIRST_CAP.id, 'in-use');
    useDocumentStore.getState().setCapabilityStatus(SECOND_CAP.id, 'in-use');
    useDocumentStore.getState().setCategoryOrder([FIRST.id, SECOND.id]);
    // Toggle FIRST off (goes to end / unlicensed)
    useDocumentStore.getState().setCategoryEnabled(FIRST.id, false);
    let order = useDocumentStore.getState().currentDocument!.capabilityMap.categoryOrder;
    expect(order).toEqual(expect.arrayContaining([FIRST.id, SECOND.id]));
    expect(order.indexOf(FIRST.id)).toBeGreaterThan(order.indexOf(SECOND.id));
    // Toggle back on — FIRST should now be after SECOND in Active segment, not before
    useDocumentStore.getState().setCategoryEnabled(FIRST.id, true);
    order = useDocumentStore.getState().currentDocument!.capabilityMap.categoryOrder;
    expect(order.indexOf(FIRST.id)).toBeGreaterThan(order.indexOf(SECOND.id));
  });

  it('triggers transition via capability bulk status change', () => {
    // Start Active by setting one cap to in-use
    useDocumentStore.getState().setCapabilityStatus(FIRST_CAP.id, 'in-use');
    // Bulk-set everything in FIRST back to not-licensed → becomes Unlicensed
    const capIds = (groupedSeed.capabilitiesByCategory.get(FIRST.id) ?? []).map((c) => c.id);
    useDocumentStore.getState().setCategoryCapabilityStatuses(capIds, 'not-licensed');
    const order = useDocumentStore.getState().currentDocument!.capabilityMap.categoryOrder;
    expect(order[order.length - 1]).toBe(FIRST.id);
  });
});

describe('clearCategoryCapabilityNotes', () => {
  beforeEach(reset);

  it('removes notes only for the provided ids', () => {
    useDocumentStore.getState().setCapabilityNotes('a', 'keep');
    useDocumentStore.getState().setCapabilityNotes('b', 'wipe');
    useDocumentStore.getState().setCapabilityNotes('c', 'wipe');
    useDocumentStore.setState({ isDirty: false });
    useDocumentStore.getState().clearCategoryCapabilityNotes(['b', 'c']);
    const notes = useDocumentStore.getState().currentDocument!.capabilityMap.capabilityNotes;
    expect(notes).toEqual({ a: 'keep' });
    expect(useDocumentStore.getState().isDirty).toBe(true);
  });
});
