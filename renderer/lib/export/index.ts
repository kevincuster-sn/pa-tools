import type { Document } from '../../../shared/file-format';
import { buildExportData, defaultExportBaseName } from './data';
import { exportCapabilityMapPdf } from './export-pdf';
import { exportCapabilityMapPptx } from './export-pptx';
import { exportRoadmapPdf } from './export-roadmap-pdf';
import { exportRoadmapPptx } from './export-roadmap-pptx';
import { buildRoadmapExportData, roadmapExportBaseName } from './roadmap-data';

export type ExportFormat = 'pdf' | 'pptx';

export interface ExportResult {
  ok: boolean;
  path?: string;
  cancelled?: boolean;
  errorMessage?: string;
}

function getApi(): typeof window.api | undefined {
  return (typeof window !== 'undefined' ? window.api : undefined) as typeof window.api | undefined;
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

  const api = getApi();
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

/**
 * Export an adoption roadmap board for the given format.
 */
export async function exportRoadmap(
  doc: Document,
  roadmapId: string,
  format: ExportFormat,
): Promise<ExportResult> {
  const data = buildRoadmapExportData(doc, roadmapId);
  const baseName = roadmapExportBaseName(data.customerName, data.boardName);

  let bytes: Uint8Array;
  let filterName: string;
  let extension: string;
  if (format === 'pdf') {
    bytes = exportRoadmapPdf(data);
    filterName = 'PDF Document';
    extension = 'pdf';
  } else {
    bytes = await exportRoadmapPptx(data);
    filterName = 'PowerPoint Presentation';
    extension = 'pptx';
  }

  const api = getApi();
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
