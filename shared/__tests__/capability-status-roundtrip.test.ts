import { describe, it, expect, beforeEach } from 'vitest';
import { useDocumentStore } from '../../renderer/state/document';
import { emptyDocument } from '../file-format';
import { packPamap, unpackPamap } from '../pamap';

describe('capability status/notes survive .pamap round-trip', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      currentDocument: emptyDocument(),
      currentFilePath: null,
      isDirty: false,
      lastSavedAt: null,
    });
  });

  it('preserves single-capability status edits', async () => {
    const store = useDocumentStore.getState();
    store.setCustomerName('Acme');
    store.setCapabilityStatus('incident-mgmt', 'in-use');
    store.setCapabilityStatus('change-mgmt', 'planning');
    store.setCapabilityNotes('change-mgmt', 'Q3 rollout');

    const doc = useDocumentStore.getState().currentDocument!;
    const bytes = await packPamap(doc, {
      appVersion: '0.0.1',
      fileId: '11111111-2222-3333-4444-555555555555',
    });
    const bundle = await unpackPamap(bytes);

    expect(bundle.document).toEqual(doc);
    expect(bundle.document.capabilityMap.capabilityStatus).toEqual({
      'incident-mgmt': 'in-use',
      'change-mgmt': 'planning',
    });
    expect(bundle.document.capabilityMap.capabilityNotes).toEqual({
      'change-mgmt': 'Q3 rollout',
    });
  });

  it('preserves bulk status edits and note clears', async () => {
    const store = useDocumentStore.getState();
    store.setCategoryCapabilityStatuses(['a', 'b', 'c'], 'planning');
    store.setCapabilityNotes('a', 'keep');
    store.setCapabilityNotes('b', 'wipe');
    store.clearCategoryCapabilityNotes(['b']);

    const doc = useDocumentStore.getState().currentDocument!;
    const bytes = await packPamap(doc, {
      appVersion: '0.0.1',
      fileId: '99999999-9999-9999-9999-999999999999',
    });
    const bundle = await unpackPamap(bytes);

    expect(bundle.document.capabilityMap.capabilityStatus).toEqual({
      a: 'planning',
      b: 'planning',
      c: 'planning',
    });
    expect(bundle.document.capabilityMap.capabilityNotes).toEqual({ a: 'keep' });
  });
});
