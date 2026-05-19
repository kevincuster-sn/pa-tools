import { describe, it, expect, beforeEach } from 'vitest';
import { useDocumentStore } from '../document';
import { emptyDocument } from '../../../shared/file-format';

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
