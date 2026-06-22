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
// categoryOrder is a flat ordered list of solution-category IDs reflecting the
// user's personalized arrangement across both Active and Inactive sections;
// IDs absent from the array fall back to the seed's displayOrder.

export interface CustomCapability {
  id: string; // e.g., "custom-cap-<uuid>"
  name: string;
}

export interface CustomCategory {
  id: string; // e.g., "custom-cat-<uuid>"
  name: string;
  fullName?: string;
  capabilities: CustomCapability[];
}

export interface CapabilityMapState {
  categoryEnabled: Record<string, boolean>;
  capabilityStatus: Record<string, CapabilityStatus>;
  capabilityNotes: Record<string, string>;
  categoryOrder: string[];
  // User-added solution-layer categories with their own capabilities.
  customCategories: CustomCategory[];
  // Extra capabilities added under existing seed categories, keyed by seed category id.
  customCapabilities: Record<string, CustomCapability[]>;
}

export interface CustomerInfo {
  name: string;
  accountId?: string;
  notes?: string;
}

// ---- Adoption Roadmap types ------------------------------------------------

export interface RoadmapColumn {
  id: string; // "rm-col-<uuid>"
  title: string;
}

export interface RoadmapSwimlane {
  id: string; // "rm-lane-<uuid>"
  title: string;
}

export interface RoadmapCard {
  id: string; // "rm-card-<uuid>" — card instance, distinct from the capability
  capabilityId: string; // reference into capabilityMap (seed or custom id)
  columnId: string;
  swimlaneId: string | null; // null when the board has no swimlanes
}

export interface AdoptionRoadmap {
  id: string; // "roadmap-<uuid>"
  name: string;
  columns: RoadmapColumn[];
  swimlanes: RoadmapSwimlane[]; // empty array → no swimlanes (single-row kanban)
  cards: RoadmapCard[]; // all cards; within-cell order = relative array order
}

// ---------------------------------------------------------------------------

export interface Document {
  customer: CustomerInfo;
  capabilityMap: CapabilityMapState;
  adoptionRoadmaps: AdoptionRoadmap[];
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
      categoryOrder: [],
      customCategories: [],
      customCapabilities: {},
    },
    adoptionRoadmaps: [],
  };
}
