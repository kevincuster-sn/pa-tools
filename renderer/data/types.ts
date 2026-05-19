// Seed-side types for the capability map: stable, shared across all customers.
// Customer-specific state (CapabilityMapState) lives in shared/file-format.ts
// because it is part of the .pamap document payload.

export type { CapabilityMapState, CapabilityStatus } from '../../shared/file-format';

export type CapabilityMapLayer = 'solution' | 'ai-native' | 'platform';

export type AiNativePillar = 'sense' | 'decide' | 'act' | 'secure';

export interface Capability {
  id: string;
  name: string;
  categoryId: string;
}

export interface Category {
  id: string;
  name: string;
  fullName?: string;
  layer: CapabilityMapLayer;
  aiNativePillar?: AiNativePillar;
  displayOrder: number;
}

export interface CapabilityMapSeed {
  schemaVersion: 1;
  generatedAt: string;
  sourceSlide: string;
  categories: Category[];
  capabilities: Capability[];
}
