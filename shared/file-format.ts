// .pamap file format
//
// A .pamap file is a zip archive with the following entries:
//   manifest.json         — { formatVersion, appVersion, createdAt, updatedAt, fileId }
//   document.json         — top-level Document payload
//   capability-map.json   — customer's capability map state
//   attachments/          — reserved (empty)

export const PAMAP_FORMAT_VERSION = 1 as const;
export const PAMAP_EXTENSION = 'pamap';

export const PAMAP_ENTRIES = {
  manifest: 'manifest.json',
  document: 'document.json',
  capabilityMap: 'capability-map.json',
  attachmentsDir: 'attachments/',
} as const;

export interface Manifest {
  formatVersion: number;
  appVersion: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  fileId: string; // uuid
}

export type CapabilityStatus =
  | 'not-licensed'
  | 'no-intent'
  | 'not-in-use'
  | 'planning'
  | 'implementing'
  | 'in-use';

// Customer-specific state attached to the seed capability map.
// Absent keys default: categoryEnabled = true, capabilityStatus = 'not-licensed'.
export interface CapabilityMapState {
  categoryEnabled: Record<string, boolean>;
  capabilityStatus: Record<string, CapabilityStatus>;
  capabilityNotes: Record<string, string>;
}

export interface CustomerInfo {
  name: string;
  accountId?: string;
  notes?: string;
}

export interface Document {
  customer: CustomerInfo;
  capabilityMap: CapabilityMapState;
}

// In-memory representation of a loaded .pamap.
export interface PamapBundle {
  manifest: Manifest;
  document: Document;
}

export function emptyDocument(): Document {
  return {
    customer: { name: '' },
    capabilityMap: {
      categoryEnabled: {},
      capabilityStatus: {},
      capabilityNotes: {},
    },
  };
}
