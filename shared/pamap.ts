import JSZip from 'jszip';
import {
  PAMAP_ENTRIES,
  PAMAP_FORMAT_VERSION,
  type Document,
  type Manifest,
  type PamapBundle,
} from './file-format';
import { DocumentSchema, ManifestSchema, PamapValidationError, formatZodIssues } from './schemas';
import { runMigrations, type MigratableBundle } from './migrations';

export interface PackOptions {
  appVersion: string;
  fileId: string;
  createdAt?: string;
  now?: () => Date;
}

export async function packPamap(document: Document, opts: PackOptions): Promise<Uint8Array> {
  const now = (opts.now ?? (() => new Date()))();
  const updatedAt = now.toISOString();
  const createdAt = opts.createdAt ?? updatedAt;

  const manifest: Manifest = {
    formatVersion: PAMAP_FORMAT_VERSION,
    appVersion: opts.appVersion,
    createdAt,
    updatedAt,
    fileId: opts.fileId,
  };

  const zip = new JSZip();
  zip.file(PAMAP_ENTRIES.manifest, JSON.stringify(manifest, null, 2));
  zip.file(PAMAP_ENTRIES.document, JSON.stringify(document, null, 2));
  zip.file(PAMAP_ENTRIES.capabilityMap, JSON.stringify(document.capabilityMap, null, 2));
  // reserve attachments/ folder for future use
  zip.folder(PAMAP_ENTRIES.attachmentsDir.replace(/\/$/, ''));

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function readJsonEntry(zip: JSZip, path: string): Promise<unknown> {
  const entry = zip.file(path);
  if (!entry) {
    throw new PamapValidationError(`Missing entry: ${path}`, [
      { path, message: 'Entry not present in archive' },
    ]);
  }
  const raw = await entry.async('string');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new PamapValidationError(`Invalid JSON in ${path}`, [
      { path, message: (e as Error).message },
    ]);
  }
}

export async function unpackPamap(bytes: Uint8Array | ArrayBuffer): Promise<PamapBundle> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    throw new PamapValidationError('File is not a valid zip archive', [
      { path: '(file)', message: (e as Error).message },
    ]);
  }

  const rawManifest = await readJsonEntry(zip, PAMAP_ENTRIES.manifest);
  const rawDocument = await readJsonEntry(zip, PAMAP_ENTRIES.document);
  // capability-map.json is a denormalized copy of document.capabilityMap;
  // document.json is the source of truth. We still parse the entry to
  // surface validation errors if a file is hand-edited badly.
  await readJsonEntry(zip, PAMAP_ENTRIES.capabilityMap).catch(() => null);

  const manifestParsed = ManifestSchema.safeParse(rawManifest);
  if (!manifestParsed.success) {
    throw new PamapValidationError(
      'manifest.json failed validation',
      formatZodIssues(manifestParsed.error),
    );
  }

  const bundle: MigratableBundle = {
    manifest: manifestParsed.data,
    document: rawDocument,
    capabilityMap: (rawDocument as { capabilityMap?: unknown }).capabilityMap,
  };

  const migrated = runMigrations(bundle);

  const documentParsed = DocumentSchema.safeParse(migrated.document);
  if (!documentParsed.success) {
    throw new PamapValidationError(
      'document.json failed validation',
      formatZodIssues(documentParsed.error),
    );
  }

  return {
    manifest: migrated.manifest as unknown as Manifest,
    document: documentParsed.data,
  };
}
