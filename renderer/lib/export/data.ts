import type { Capability, Category } from '../../data/types';
import type { CapabilityStatus, Document } from '../../../shared/file-format';
import {
  AI_NATIVE_PILLAR_LABELS,
  getEffectiveCapabilitiesForCategory,
  getEffectiveSolutionCategories,
  groupedSeed,
  isCategoryEnabled,
  isCustomCategoryId,
  partitionCategories,
} from '../capability-map';
import { computeAdoption, getCapabilityStatus } from '../capability-status';

export interface ExportCapability {
  id: string;
  name: string;
  status: CapabilityStatus;
  notes: string;
}

export interface ExportCategory {
  id: string;
  name: string;
  fullName?: string;
  capabilities: ExportCapability[];
  adoption: { licensed: number; adopted: number; pct: number };
}

export interface ExportAiPillar {
  pillar: string;
  label: string;
  fullName?: string;
  capabilities: ExportCapability[];
}

export interface ExportData {
  customerName: string;
  generatedAt: Date;
  overallAdoption: { licensed: number; adopted: number; pct: number };
  enabledCategoryCount: number;
  totalCategoryCount: number;
  activeCategories: ExportCategory[];
  aiControlTower: {
    name: string;
    capabilities: ExportCapability[];
  } | null;
  aiPillars: ExportAiPillar[];
}

function toExportCapabilities(
  capabilities: readonly Capability[],
  statusMap: Record<string, CapabilityStatus>,
  notesMap: Record<string, string>,
): ExportCapability[] {
  return capabilities.map((c) => ({
    id: c.id,
    name: c.name,
    status: getCapabilityStatus(statusMap, c.id),
    notes: notesMap[c.id] ?? '',
  }));
}

/** Build a snapshot of the capability map that contains only active items. */
export function buildExportData(doc: Document): ExportData {
  const statusMap = doc.capabilityMap.capabilityStatus;
  const notesMap = doc.capabilityMap.capabilityNotes;
  const categoryEnabled = doc.capabilityMap.categoryEnabled;

  const solutionCategories = getEffectiveSolutionCategories(doc.capabilityMap);
  const { active } = partitionCategories(solutionCategories, doc.capabilityMap);

  const activeCategories: ExportCategory[] = active.map((cat: Category) => {
    const caps = getEffectiveCapabilitiesForCategory(doc.capabilityMap, cat.id);
    const exportCaps = toExportCapabilities(caps, statusMap, notesMap);
    // Adoption excludes custom items: empty for custom categories,
    // seed-only for seed categories with custom extras.
    const adoptionIds = isCustomCategoryId(doc.capabilityMap, cat.id)
      ? []
      : (groupedSeed.capabilitiesByCategory.get(cat.id) ?? []).map((c) => c.id);
    return {
      id: cat.id,
      name: cat.name,
      fullName: cat.fullName,
      capabilities: exportCaps,
      adoption: computeAdoption(adoptionIds, statusMap),
    };
  });

  const aiControlTower = groupedSeed.aiControlTower.category
    ? {
        name: groupedSeed.aiControlTower.category.name,
        capabilities: toExportCapabilities(
          groupedSeed.aiControlTower.capabilities,
          statusMap,
          notesMap,
        ),
      }
    : null;

  const aiPillars: ExportAiPillar[] = groupedSeed.pillars.map((p) => ({
    pillar: p.pillar,
    label: AI_NATIVE_PILLAR_LABELS[p.pillar],
    fullName: p.category?.fullName,
    capabilities: toExportCapabilities(p.capabilities, statusMap, notesMap),
  }));

  // Overall adoption excludes custom items — it measures the seed offering.
  const overallAdoption = computeAdoption(
    groupedSeed.allCapabilities.map((c) => c.id),
    statusMap,
  );

  let enabled = 0;
  for (const cat of solutionCategories) {
    if (isCategoryEnabled(categoryEnabled, cat.id)) enabled += 1;
  }

  return {
    customerName: doc.customer.name?.trim() || 'Untitled',
    generatedAt: new Date(),
    overallAdoption,
    enabledCategoryCount: enabled,
    totalCategoryCount: solutionCategories.length,
    activeCategories,
    aiControlTower,
    aiPillars,
  };
}

/** Sanitize a customer name for use in a default export filename. */
export function defaultExportBaseName(customerName: string): string {
  const safe = customerName.replace(/[\\/:*?"<>|]/g, '').trim() || 'Untitled';
  return `${safe} - Capability Map`;
}
