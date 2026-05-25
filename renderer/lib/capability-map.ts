import type { CapabilityMapState, CustomCapability } from '../../shared/file-format';
import seedJson from '../data/capability-map.seed.json';
import type { AiNativePillar, Capability, CapabilityMapSeed, Category } from '../data/types';

export const seed = seedJson as CapabilityMapSeed;

export const AI_NATIVE_PILLAR_ORDER: readonly AiNativePillar[] = [
  'sense',
  'decide',
  'act',
  'secure',
] as const;

export const AI_NATIVE_PILLAR_LABELS: Record<AiNativePillar, string> = {
  sense: 'SENSE',
  decide: 'DECIDE',
  act: 'ACT',
  secure: 'SECURE',
};

export interface GroupedSeed {
  solutionCategories: Category[];
  aiControlTower: { category: Category | undefined; capabilities: Capability[] };
  pillars: Array<{
    pillar: AiNativePillar;
    category: Category | undefined;
    capabilities: Capability[];
  }>;
  capabilitiesByCategory: Map<string, Capability[]>;
  allCapabilities: Capability[];
}

function groupSeed(s: CapabilityMapSeed): GroupedSeed {
  const capabilitiesByCategory = new Map<string, Capability[]>();
  const allCapabilities: Capability[] = [];
  for (const cat of s.categories) {
    capabilitiesByCategory.set(cat.id, cat.capabilities);
    allCapabilities.push(...cat.capabilities);
  }

  const solutionCategories = s.categories
    .filter((c) => c.layer === 'solution')
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const aiControlTowerCategory = s.categories.find((c) => c.layer === 'ai-native');

  const pillars = AI_NATIVE_PILLAR_ORDER.map((pillar) => {
    const category = s.categories.find(
      (c) => c.layer === 'platform' && c.aiNativePillar === pillar,
    );
    const capabilities = category ? (capabilitiesByCategory.get(category.id) ?? []) : [];
    return { pillar, category, capabilities };
  });

  return {
    solutionCategories,
    aiControlTower: {
      category: aiControlTowerCategory,
      capabilities: aiControlTowerCategory
        ? (capabilitiesByCategory.get(aiControlTowerCategory.id) ?? [])
        : [],
    },
    pillars,
    capabilitiesByCategory,
    allCapabilities,
  };
}

export const groupedSeed: GroupedSeed = groupSeed(seed);

export const capabilityToCategoryId: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const cat of seed.categories) {
    for (const cap of cat.capabilities) {
      map.set(cap.id, cat.id);
    }
  }
  return map;
})();

export function isCategoryInactive(state: CapabilityMapState, categoryId: string): boolean {
  return state.categoryEnabled[categoryId] === false;
}

export interface PartitionedCategories {
  active: Category[];
  inactive: Category[];
}

export function partitionCategories(
  solutionCategories: readonly Category[],
  state: CapabilityMapState,
): PartitionedCategories {
  const order = state.categoryOrder;
  const orderIndex = new Map<string, number>();
  order.forEach((id, idx) => orderIndex.set(id, idx));

  const sorter = (a: Category, b: Category) => {
    const ai = orderIndex.get(a.id);
    const bi = orderIndex.get(b.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.displayOrder - b.displayOrder;
  };

  const active: Category[] = [];
  const inactive: Category[] = [];
  for (const cat of solutionCategories) {
    if (isCategoryInactive(state, cat.id)) {
      inactive.push(cat);
    } else {
      active.push(cat);
    }
  }
  active.sort(sorter);
  inactive.sort(sorter);
  return { active, inactive };
}

export function isCategoryEnabled(
  categoryEnabled: Record<string, boolean>,
  categoryId: string,
): boolean {
  // Default to enabled when absent.
  return categoryEnabled[categoryId] !== false;
}

export function matchesSearch(name: string, term: string): boolean {
  if (!term) return true;
  return name.toLowerCase().includes(term);
}

const MAX_SEED_SOLUTION_DISPLAY_ORDER = (() => {
  let max = 0;
  for (const c of groupedSeed.solutionCategories) {
    if (c.displayOrder > max) max = c.displayOrder;
  }
  return max;
})();

const seedSolutionCategoryIds = new Set(groupedSeed.solutionCategories.map((c) => c.id));

function customCategoriesOf(state: CapabilityMapState) {
  return state.customCategories ?? [];
}

function customCapabilitiesOf(state: CapabilityMapState) {
  return state.customCapabilities ?? {};
}

export function getEffectiveSolutionCategories(state: CapabilityMapState): Category[] {
  const customs = customCategoriesOf(state);
  if (customs.length === 0) return groupedSeed.solutionCategories;
  const mapped: Category[] = customs.map((c, idx) => ({
    id: c.id,
    name: c.name,
    fullName: c.fullName,
    layer: 'solution',
    displayOrder: MAX_SEED_SOLUTION_DISPLAY_ORDER + idx + 1,
  }));
  return [...groupedSeed.solutionCategories, ...mapped];
}

export function getEffectiveCapabilitiesForCategory(
  state: CapabilityMapState,
  categoryId: string,
): Capability[] {
  const custom = customCategoriesOf(state).find((c) => c.id === categoryId);
  if (custom) {
    return custom.capabilities.map((c) => ({ id: c.id, name: c.name }));
  }
  const seedCaps = groupedSeed.capabilitiesByCategory.get(categoryId) ?? [];
  const extras = customCapabilitiesOf(state)[categoryId] ?? [];
  if (extras.length === 0) return seedCaps;
  return [...seedCaps, ...extras.map((c) => ({ id: c.id, name: c.name }))];
}

export function getAllEffectiveCapabilities(state: CapabilityMapState): Capability[] {
  const out: Capability[] = [...groupedSeed.allCapabilities];
  const extras = customCapabilitiesOf(state);
  for (const list of Object.values(extras)) {
    for (const cap of list) out.push({ id: cap.id, name: cap.name });
  }
  for (const cat of customCategoriesOf(state)) {
    for (const cap of cat.capabilities) out.push({ id: cap.id, name: cap.name });
  }
  return out;
}

export function isCustomCategoryId(state: CapabilityMapState, categoryId: string): boolean {
  return customCategoriesOf(state).some((c) => c.id === categoryId);
}

export function isCustomCapabilityId(state: CapabilityMapState, capabilityId: string): boolean {
  for (const cat of customCategoriesOf(state)) {
    if (cat.capabilities.some((c) => c.id === capabilityId)) return true;
  }
  for (const list of Object.values(customCapabilitiesOf(state))) {
    if (list.some((c) => c.id === capabilityId)) return true;
  }
  return false;
}

export function findCustomCapability(
  state: CapabilityMapState,
  capabilityId: string,
): {
  capability: CustomCapability;
  ownerCategoryId: string;
  ownerIsCustomCategory: boolean;
} | null {
  for (const cat of customCategoriesOf(state)) {
    const found = cat.capabilities.find((c) => c.id === capabilityId);
    if (found) {
      return { capability: found, ownerCategoryId: cat.id, ownerIsCustomCategory: true };
    }
  }
  const extras = customCapabilitiesOf(state);
  for (const [catId, list] of Object.entries(extras)) {
    const found = list.find((c) => c.id === capabilityId);
    if (found) {
      return { capability: found, ownerCategoryId: catId, ownerIsCustomCategory: false };
    }
  }
  return null;
}

export function isSeedSolutionCategoryId(categoryId: string): boolean {
  return seedSolutionCategoryIds.has(categoryId);
}
