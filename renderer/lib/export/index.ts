import type { Document } from '../../../shared/file-format';
import { buildExportData, defaultExportBaseName } from './data';
import { exportCapabilityMapPdf } from './export-pdf';
import { exportCapabilityMapPptx } from './export-pptx';

export type ExportFormat = 'pdf' | 'pptx';

export interface ExportResult {
  ok: boolean;
  path?: string;
  cancelled?: boolean;
  errorMessage?: string;
}

/**
 * Build the export bytes for the given format and hand them to Electron's
 * save dialog. Returns the outcome the caller can use to toast / surface
 * status to the user.
 */
export async function exportCapabilityMap(
  doc: Document,
  format: ExportFormat,
): Promise<ExportResult> {
  const data = buildExportData(doc);
  const baseName = defaultExportBaseName(data.customerName);

  let bytes: Uint8Array;
  let filterName: string;
  let extension: string;
  if (format === 'pdf') {
    bytes = exportCapabilityMapPdf(data);
    filterName = 'PDF Document';
    extension = 'pdf';
  } else {
    bytes = await exportCapabilityMapPptx(data);
    filterName = 'PowerPoint Presentation';
    extension = 'pptx';
  }

  const api = (typeof window !== 'undefined' ? window.api : undefined) as
    | typeof window.api
    | undefined;
  if (!api?.exportSave) {
    return { ok: false, errorMessage: 'Export is only available in the desktop app.' };
  }

  const result = await api.exportSave({
    defaultName: `${baseName}.${extension}`,
    filterName,
    extensions: [extension],
    data: bytes,
  });

  if (result === null) return { ok: false, cancelled: true };
  if (!result.ok) return { ok: false, errorMessage: result.error.message };
  return { ok: true, path: result.path };
}
