import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { packPamap, unpackPamap } from '../pamap';
import { emptyDocument, PAMAP_ENTRIES, type Document } from '../file-format';
import { PamapValidationError } from '../schemas';
import { NewerFileFormatError } from '../migrations';

const sampleDoc: Document = {
  customer: { name: 'Acme Corp', accountId: 'ACC-123', notes: 'pilot' },
  capabilityMap: {
    categoryEnabled: { itsm: true, csm: true, hrsd: false },
    capabilityStatus: {
      'incident-management': 'in-use',
      'change-management': 'planning',
    },
    capabilityNotes: {
      'change-management': 'Q3 rollout',
    },
  },
};

describe('packPamap / unpackPamap', () => {
  it('round-trips a document unchanged', async () => {
    const bytes = await packPamap(sampleDoc, {
      appVersion: '0.0.1',
      fileId: '00000000-0000-0000-0000-000000000001',
    });
    const bundle = await unpackPamap(bytes);
    expect(bundle.document).toEqual(sampleDoc);
    expect(bundle.manifest.formatVersion).toBe(1);
    expect(bundle.manifest.fileId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('writes a valid zip readable by external tools', async () => {
    const bytes = await packPamap(emptyDocument(), {
      appVersion: '0.0.1',
      fileId: 'abc',
    });
    const reopened = await JSZip.loadAsync(bytes);
    expect(reopened.file(PAMAP_ENTRIES.manifest)).not.toBeNull();
    expect(reopened.file(PAMAP_ENTRIES.document)).not.toBeNull();
    expect(reopened.file(PAMAP_ENTRIES.capabilityMap)).not.toBeNull();
    const docJson = JSON.parse(await reopened.file(PAMAP_ENTRIES.document)!.async('string'));
    expect(docJson).toEqual(emptyDocument());
  });

  it('rejects garbage bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(unpackPamap(bytes)).rejects.toBeInstanceOf(PamapValidationError);
  });

  it('rejects a zip missing required entries', async () => {
    const zip = new JSZip();
    zip.file(PAMAP_ENTRIES.manifest, '{"formatVersion":1}');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    await expect(unpackPamap(bytes)).rejects.toBeInstanceOf(PamapValidationError);
  });

  it('rejects an invalid document payload with issue paths', async () => {
    const zip = new JSZip();
    zip.file(
      PAMAP_ENTRIES.manifest,
      JSON.stringify({
        formatVersion: 1,
        appVersion: '0.0.1',
        createdAt: 'now',
        updatedAt: 'now',
        fileId: 'x',
      }),
    );
    zip.file(
      PAMAP_ENTRIES.document,
      JSON.stringify({
        customer: { name: 'ok' },
        // capabilityMap missing required fields
        capabilityMap: { capabilityStatus: 'not-a-record' },
      }),
    );
    zip.file(PAMAP_ENTRIES.capabilityMap, '{}');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    await expect(unpackPamap(bytes)).rejects.toMatchObject({
      name: 'PamapValidationError',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining('capabilityMap') }),
      ]),
    });
  });

  it('refuses to open a file from a newer format version', async () => {
    const zip = new JSZip();
    zip.file(
      PAMAP_ENTRIES.manifest,
      JSON.stringify({
        formatVersion: 99,
        appVersion: '99.0.0',
        createdAt: 'now',
        updatedAt: 'now',
        fileId: 'x',
      }),
    );
    zip.file(PAMAP_ENTRIES.document, JSON.stringify(emptyDocument()));
    zip.file(PAMAP_ENTRIES.capabilityMap, '{}');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    await expect(unpackPamap(bytes)).rejects.toBeInstanceOf(NewerFileFormatError);
  });
});
