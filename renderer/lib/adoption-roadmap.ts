import type { CapabilityMapState } from '../../shared/file-format';
import {
  capabilityToCategoryId,
  findCustomCapability,
  getEffectiveCapabilitiesForCategory,
  getEffectiveSolutionCategories,
  isCategoryEnabled,
  seed,
} from './capability-map';

export interface CapabilityInfo {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
}

/**
 * Build a lookup map from capability id → { name, categoryId, categoryName }
 * covering all seed and custom capabilities.
 */
export function buildCapabilityLookup(
  capabilityMap: CapabilityMapState,
): Map<string, CapabilityInfo> {
  const result = new Map<string, CapabilityInfo>();

  // Seed capabilities: categoryId from the static reverse-lookup map.
  for (const cat of seed.categories) {
    for (const cap of cat.capabilities) {
      result.set(cap.id, {
        id: cap.id,
        name: cap.name,
        categoryId: cat.id,
        categoryName: cat.name,
      });
    }
  }

  // Custom categories and their capabilities.
  for (const customCat of capabilityMap.customCategories ?? []) {
    for (const cap of customCat.capabilities) {
      result.set(cap.id, {
        id: cap.id,
        name: cap.name,
        categoryId: customCat.id,
        categoryName: customCat.name,
      });
    }
  }

  // Custom capabilities added to existing seed categories.
  for (const [catId, caps] of Object.entries(capabilityMap.customCapabilities ?? {})) {
    const seedCat = seed.categories.find((c) => c.id === catId);
    const catName = seedCat?.name ?? catId;
    for (const cap of caps) {
      result.set(cap.id, {
        id: cap.id,
        name: cap.name,
        categoryId: catId,
        categoryName: catName,
      });
    }
  }

  return result;
}

/**
 * Build an ordered list of { categoryId, categoryName, capabilities[] } groups
 * suitable for the "add capabilities" picker. Uses the effective solution
 * categories so custom categories are included.
 */
export interface CapabilityGroup {
  categoryId: string;
  categoryName: string;
  capabilities: CapabilityInfo[];
}

export function buildCapabilityGroups(capabilityMap: CapabilityMapState): CapabilityGroup[] {
  const effectiveCats = getEffectiveSolutionCategories(capabilityMap);
  return effectiveCats
    .filter((cat) => isCategoryEnabled(capabilityMap.categoryEnabled, cat.id))
    .map((cat) => {
      const caps = getEffectiveCapabilitiesForCategory(capabilityMap, cat.id);
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        capabilities: caps.map((cap) => ({
          id: cap.id,
          name: cap.name,
          categoryId: cat.id,
          categoryName: cat.name,
        })),
      };
    });
}

// Re-export for convenience.
export { capabilityToCategoryId, findCustomCapability };
