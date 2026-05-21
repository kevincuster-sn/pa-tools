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
