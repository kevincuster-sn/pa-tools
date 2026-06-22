import { create } from 'zustand';
import {
  emptyDocument,
  type AdoptionRoadmap,
  type CapabilityStatus,
  type CustomCapability,
  type CustomCategory,
  type Document,
  type RoadmapCard,
  type RoadmapColumn,
  type RoadmapSwimlane,
} from '../../shared/file-format';
import {
  findCustomCapability,
  getEffectiveSolutionCategories,
  isCategoryInactive,
  isCustomCategoryId,
} from '../lib/capability-map';

export interface DocumentState {
  currentDocument: Document | null;
  currentFilePath: string | null;
  isDirty: boolean;
  lastSavedAt: number | null;

  loadDocument: (doc: Document | null, path: string | null) => void;
  updateDocument: (mutator: (draft: Document) => Document) => void;
  setCustomerName: (name: string) => void;
  setCategoryEnabled: (categoryId: string, enabled: boolean) => void;
  setCapabilityStatus: (capabilityId: string, status: CapabilityStatus) => void;
  setCapabilityNotes: (capabilityId: string, notes: string) => void;
  setCategoryCapabilityStatuses: (
    capabilityIds: readonly string[],
    status: CapabilityStatus,
  ) => void;
  clearCategoryCapabilityNotes: (capabilityIds: readonly string[]) => void;
  setCategoryOrder: (order: string[]) => void;
  addCustomCategory: (name: string) => string | null;
  renameCustomCategory: (categoryId: string, name: string) => void;
  deleteCustomCategory: (categoryId: string) => void;
  addCapabilityToCategory: (categoryId: string, name: string) => string | null;
  renameCapability: (capabilityId: string, name: string) => void;
  deleteCapability: (capabilityId: string) => void;
  markDirty: () => void;
  markClean: (savedAt?: number) => void;
  setFilePath: (path: string | null) => void;

  // ---- Adoption Roadmap actions -------------------------------------------
  addRoadmap: (name: string) => string | null;
  renameRoadmap: (roadmapId: string, name: string) => void;
  deleteRoadmap: (roadmapId: string) => void;
  addRoadmapColumn: (roadmapId: string, title: string) => string | null;
  renameRoadmapColumn: (roadmapId: string, columnId: string, title: string) => void;
  deleteRoadmapColumn: (roadmapId: string, columnId: string) => void;
  setRoadmapColumnOrder: (roadmapId: string, columnIds: string[]) => void;
  addRoadmapSwimlane: (roadmapId: string, title: string) => string | null;
  renameRoadmapSwimlane: (roadmapId: string, swimlaneId: string, title: string) => void;
  deleteRoadmapSwimlane: (roadmapId: string, swimlaneId: string) => void;
  setRoadmapSwimlaneOrder: (roadmapId: string, swimlaneIds: string[]) => void;
  addCapabilitiesToRoadmap: (
    roadmapId: string,
    capabilityIds: string[],
    columnId: string,
    swimlaneId: string | null,
  ) => void;
  moveRoadmapCard: (
    roadmapId: string,
    cardId: string,
    columnId: string,
    swimlaneId: string | null,
    index: number,
  ) => void;
  removeRoadmapCard: (roadmapId: string, cardId: string) => void;
}

function makeCustomCategoryId(): string {
  return `custom-cat-${crypto.randomUUID()}`;
}

function makeCustomCapabilityId(): string {
  return `custom-cap-${crypto.randomUUID()}`;
}

function makeRoadmapId(): string {
  return `roadmap-${crypto.randomUUID()}`;
}

function makeRoadmapColumnId(): string {
  return `rm-col-${crypto.randomUUID()}`;
}

function makeRoadmapSwimlaneId(): string {
  return `rm-lane-${crypto.randomUUID()}`;
}

function makeRoadmapCardId(): string {
  return `rm-card-${crypto.randomUUID()}`;
}

/** Remove cards referencing any of the given capability ids from all roadmaps. */
function pruneRoadmapCards(
  roadmaps: AdoptionRoadmap[],
  capabilityIds: Set<string>,
): AdoptionRoadmap[] {
  if (capabilityIds.size === 0) return roadmaps;
  return roadmaps.map((rm) => {
    const filtered = rm.cards.filter((c) => !capabilityIds.has(c.capabilityId));
    if (filtered.length === rm.cards.length) return rm;
    return { ...rm, cards: filtered };
  });
}

/** Rebuild a roadmap with cards in a specific cell rearranged so the given card is at `index`. */
function applyCardMove(
  roadmap: AdoptionRoadmap,
  cardId: string,
  columnId: string,
  swimlaneId: string | null,
  index: number,
): AdoptionRoadmap {
  const card = roadmap.cards.find((c) => c.id === cardId);
  if (!card) return roadmap;

  const updatedCard: RoadmapCard = { ...card, columnId, swimlaneId };
  const withoutCard = roadmap.cards.filter((c) => c.id !== cardId);

  // Cards currently in the destination cell (after removing the moved card).
  const destCards = withoutCard.filter(
    (c) => c.columnId === columnId && c.swimlaneId === swimlaneId,
  );

  // Clamp index.
  const clampedIdx = Math.max(0, Math.min(index, destCards.length));

  let nextCards: RoadmapCard[];
  if (destCards.length === 0 || clampedIdx >= destCards.length) {
    // Append after the last card in the destination cell (or at end of flat array).
    const lastDestCard = destCards[destCards.length - 1];
    const afterIdx = lastDestCard
      ? withoutCard.findIndex((c) => c.id === lastDestCard.id) + 1
      : withoutCard.length;
    nextCards = [...withoutCard.slice(0, afterIdx), updatedCard, ...withoutCard.slice(afterIdx)];
  } else {
    // Insert before the card at `clampedIdx` in the destination cell.
    const insertBeforeCard = destCards[clampedIdx]!;
    const insertBeforeIdx = withoutCard.findIndex((c) => c.id === insertBeforeCard.id);
    nextCards = [
      ...withoutCard.slice(0, insertBeforeIdx),
      updatedCard,
      ...withoutCard.slice(insertBeforeIdx),
    ];
  }

  return { ...roadmap, cards: nextCards };
}

function categoryInactiveIn(doc: Document, categoryId: string): boolean {
  return isCategoryInactive(doc.capabilityMap, categoryId);
}

// After a toggle change, reposition the affected category if its section
// membership flipped: Active→Inactive sends the id to the end of the
// Inactive segment (end of categoryOrder); Inactive→Active sends it to the
// end of the Active segment (just after the last currently-active id).
// Only `setCategoryEnabled` can trigger this — capability status changes no
// longer affect section membership.
function applyTransitions(
  before: Document,
  after: Document,
  affectedCategoryIds: readonly string[],
): Document {
  if (affectedCategoryIds.length === 0) return after;
  // Canonical full order: existing order + missing solution categories
  // (seed + custom) in their default order.
  const effectiveSolution = getEffectiveSolutionCategories(after.capabilityMap);
  const effectiveIds = new Set(effectiveSolution.map((c) => c.id));
  const existing = after.capabilityMap.categoryOrder;
  const present = new Set(existing);
  const fullOrder: string[] = [...existing];
  for (const c of effectiveSolution) {
    if (!present.has(c.id)) fullOrder.push(c.id);
  }

  let nextOrder = fullOrder;
  let mutated = false;
  for (const categoryId of affectedCategoryIds) {
    if (!effectiveIds.has(categoryId)) continue;

    const wasInactive = categoryInactiveIn(before, categoryId);
    const isInactive = categoryInactiveIn(after, categoryId);
    if (wasInactive === isInactive) continue;

    const withoutAffected = nextOrder.filter((id) => id !== categoryId);
    if (isInactive) {
      nextOrder = [...withoutAffected, categoryId];
    } else {
      let insertAt = 0;
      for (let i = withoutAffected.length - 1; i >= 0; i--) {
        const otherId = withoutAffected[i];
        if (otherId && !categoryInactiveIn(after, otherId)) {
          insertAt = i + 1;
          break;
        }
      }
      nextOrder = [
        ...withoutAffected.slice(0, insertAt),
        categoryId,
        ...withoutAffected.slice(insertAt),
      ];
    }
    mutated = true;
  }

  // If we expanded the canonical list with seed categories, persist that too
  // so future renders are stable.
  const expandedFromExisting = nextOrder.length !== existing.length;
  if (!mutated && !expandedFromExisting) return after;
  return {
    ...after,
    capabilityMap: { ...after.capabilityMap, categoryOrder: nextOrder },
  };
}

export const useDocumentStore = create<DocumentState>((set) => ({
  currentDocument: null,
  currentFilePath: null,
  isDirty: false,
  lastSavedAt: null,

  loadDocument: (doc, path) =>
    set({
      currentDocument: doc,
      currentFilePath: path,
      isDirty: false,
      lastSavedAt: null,
    }),

  updateDocument: (mutator) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const next = mutator(base);
      return { currentDocument: next, isDirty: true };
    }),

  setCustomerName: (name) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      if (base.customer.name === name) return state;
      return {
        currentDocument: { ...base, customer: { ...base.customer, name } },
        isDirty: true,
      };
    }),

  setCategoryEnabled: (categoryId, enabled) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const current = base.capabilityMap.categoryEnabled[categoryId];
      if (current === enabled) return state;
      const after: Document = {
        ...base,
        capabilityMap: {
          ...base.capabilityMap,
          categoryEnabled: {
            ...base.capabilityMap.categoryEnabled,
            [categoryId]: enabled,
          },
        },
      };
      return {
        currentDocument: applyTransitions(base, after, [categoryId]),
        isDirty: true,
      };
    }),

  setCapabilityStatus: (capabilityId, status) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const current = base.capabilityMap.capabilityStatus[capabilityId];
      if (current === status) return state;
      const after: Document = {
        ...base,
        capabilityMap: {
          ...base.capabilityMap,
          capabilityStatus: {
            ...base.capabilityMap.capabilityStatus,
            [capabilityId]: status,
          },
        },
      };
      return { currentDocument: after, isDirty: true };
    }),

  setCapabilityNotes: (capabilityId, notes) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const current = base.capabilityMap.capabilityNotes[capabilityId] ?? '';
      if (current === notes) return state;
      const nextNotes = { ...base.capabilityMap.capabilityNotes };
      if (notes === '') {
        delete nextNotes[capabilityId];
      } else {
        nextNotes[capabilityId] = notes;
      }
      return {
        currentDocument: {
          ...base,
          capabilityMap: { ...base.capabilityMap, capabilityNotes: nextNotes },
        },
        isDirty: true,
      };
    }),

  setCategoryCapabilityStatuses: (capabilityIds, status) =>
    set((state) => {
      if (capabilityIds.length === 0) return state;
      const base = state.currentDocument ?? emptyDocument();
      const nextStatus = { ...base.capabilityMap.capabilityStatus };
      let changed = false;
      for (const id of capabilityIds) {
        if (nextStatus[id] !== status) {
          nextStatus[id] = status;
          changed = true;
        }
      }
      if (!changed) return state;
      return {
        currentDocument: {
          ...base,
          capabilityMap: { ...base.capabilityMap, capabilityStatus: nextStatus },
        },
        isDirty: true,
      };
    }),

  clearCategoryCapabilityNotes: (capabilityIds) =>
    set((state) => {
      if (capabilityIds.length === 0) return state;
      const base = state.currentDocument ?? emptyDocument();
      const nextNotes = { ...base.capabilityMap.capabilityNotes };
      let changed = false;
      for (const id of capabilityIds) {
        if (id in nextNotes) {
          delete nextNotes[id];
          changed = true;
        }
      }
      if (!changed) return state;
      return {
        currentDocument: {
          ...base,
          capabilityMap: { ...base.capabilityMap, capabilityNotes: nextNotes },
        },
        isDirty: true,
      };
    }),

  setCategoryOrder: (order) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const current = base.capabilityMap.categoryOrder;
      if (current.length === order.length && current.every((id, idx) => id === order[idx])) {
        return state;
      }
      return {
        currentDocument: {
          ...base,
          capabilityMap: { ...base.capabilityMap, categoryOrder: order },
        },
        isDirty: true,
      };
    }),

  addCustomCategory: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const newId = makeCustomCategoryId();
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const newCat: CustomCategory = { id: newId, name: trimmed, capabilities: [] };
      const nextCustom = [...(base.capabilityMap.customCategories ?? []), newCat];
      // Place at the end of the Active segment in categoryOrder.
      // Build the canonical order first (existing + missing seed/custom ids).
      const orderWithNew = [...base.capabilityMap.categoryOrder];
      // Determine where the active segment ends.
      let insertAt = 0;
      for (let i = orderWithNew.length - 1; i >= 0; i--) {
        const id = orderWithNew[i]!;
        if (!isCategoryInactive(base.capabilityMap, id)) {
          insertAt = i + 1;
          break;
        }
      }
      if (orderWithNew.length === 0) insertAt = 0;
      const nextOrder = [
        ...orderWithNew.slice(0, insertAt),
        newId,
        ...orderWithNew.slice(insertAt),
      ];
      return {
        currentDocument: {
          ...base,
          capabilityMap: {
            ...base.capabilityMap,
            customCategories: nextCustom,
            categoryOrder: nextOrder,
          },
        },
        isDirty: true,
      };
    });
    return newId;
  },

  renameCustomCategory: (categoryId, name) =>
    set((state) => {
      const trimmed = name.trim();
      if (!trimmed) return state;
      const base = state.currentDocument ?? emptyDocument();
      const customs = base.capabilityMap.customCategories ?? [];
      const idx = customs.findIndex((c) => c.id === categoryId);
      if (idx < 0) return state;
      if (customs[idx]!.name === trimmed) return state;
      const next = [...customs];
      next[idx] = { ...next[idx]!, name: trimmed };
      return {
        currentDocument: {
          ...base,
          capabilityMap: { ...base.capabilityMap, customCategories: next },
        },
        isDirty: true,
      };
    }),

  deleteCustomCategory: (categoryId) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const customs = base.capabilityMap.customCategories ?? [];
      const target = customs.find((c) => c.id === categoryId);
      if (!target) return state;
      const nextCustom = customs.filter((c) => c.id !== categoryId);
      const capIdsToRemove = new Set(target.capabilities.map((c) => c.id));
      const nextStatus = { ...base.capabilityMap.capabilityStatus };
      const nextNotes = { ...base.capabilityMap.capabilityNotes };
      for (const id of capIdsToRemove) {
        delete nextStatus[id];
        delete nextNotes[id];
      }
      const nextEnabled = { ...base.capabilityMap.categoryEnabled };
      delete nextEnabled[categoryId];
      const nextOrder = base.capabilityMap.categoryOrder.filter((id) => id !== categoryId);
      // Prune roadmap cards that reference any deleted capability.
      const nextRoadmaps = pruneRoadmapCards(base.adoptionRoadmaps ?? [], capIdsToRemove);
      return {
        currentDocument: {
          ...base,
          capabilityMap: {
            ...base.capabilityMap,
            customCategories: nextCustom,
            capabilityStatus: nextStatus,
            capabilityNotes: nextNotes,
            categoryEnabled: nextEnabled,
            categoryOrder: nextOrder,
          },
          adoptionRoadmaps: nextRoadmaps,
        },
        isDirty: true,
      };
    }),

  addCapabilityToCategory: (categoryId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const newId = makeCustomCapabilityId();
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const newCap: CustomCapability = { id: newId, name: trimmed };
      if (isCustomCategoryId(base.capabilityMap, categoryId)) {
        const customs = base.capabilityMap.customCategories ?? [];
        const next = customs.map((c) =>
          c.id === categoryId ? { ...c, capabilities: [...c.capabilities, newCap] } : c,
        );
        return {
          currentDocument: {
            ...base,
            capabilityMap: { ...base.capabilityMap, customCategories: next },
          },
          isDirty: true,
        };
      }
      const extras = base.capabilityMap.customCapabilities ?? {};
      const list = extras[categoryId] ?? [];
      const nextExtras = { ...extras, [categoryId]: [...list, newCap] };
      return {
        currentDocument: {
          ...base,
          capabilityMap: { ...base.capabilityMap, customCapabilities: nextExtras },
        },
        isDirty: true,
      };
    });
    return newId;
  },

  renameCapability: (capabilityId, name) =>
    set((state) => {
      const trimmed = name.trim();
      if (!trimmed) return state;
      const base = state.currentDocument ?? emptyDocument();
      const found = findCustomCapability(base.capabilityMap, capabilityId);
      if (!found) return state;
      if (found.capability.name === trimmed) return state;
      if (found.ownerIsCustomCategory) {
        const customs = base.capabilityMap.customCategories ?? [];
        const next = customs.map((c) =>
          c.id !== found.ownerCategoryId
            ? c
            : {
                ...c,
                capabilities: c.capabilities.map((cap) =>
                  cap.id === capabilityId ? { ...cap, name: trimmed } : cap,
                ),
              },
        );
        return {
          currentDocument: {
            ...base,
            capabilityMap: { ...base.capabilityMap, customCategories: next },
          },
          isDirty: true,
        };
      }
      const extras = base.capabilityMap.customCapabilities ?? {};
      const list = extras[found.ownerCategoryId] ?? [];
      const nextList = list.map((cap) =>
        cap.id === capabilityId ? { ...cap, name: trimmed } : cap,
      );
      return {
        currentDocument: {
          ...base,
          capabilityMap: {
            ...base.capabilityMap,
            customCapabilities: { ...extras, [found.ownerCategoryId]: nextList },
          },
        },
        isDirty: true,
      };
    }),

  deleteCapability: (capabilityId) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const found = findCustomCapability(base.capabilityMap, capabilityId);
      if (!found) return state;
      const nextStatus = { ...base.capabilityMap.capabilityStatus };
      const nextNotes = { ...base.capabilityMap.capabilityNotes };
      delete nextStatus[capabilityId];
      delete nextNotes[capabilityId];
      // Prune roadmap cards referencing this capability.
      const nextRoadmaps = pruneRoadmapCards(base.adoptionRoadmaps ?? [], new Set([capabilityId]));
      if (found.ownerIsCustomCategory) {
        const customs = base.capabilityMap.customCategories ?? [];
        const next = customs.map((c) =>
          c.id !== found.ownerCategoryId
            ? c
            : { ...c, capabilities: c.capabilities.filter((cap) => cap.id !== capabilityId) },
        );
        return {
          currentDocument: {
            ...base,
            capabilityMap: {
              ...base.capabilityMap,
              customCategories: next,
              capabilityStatus: nextStatus,
              capabilityNotes: nextNotes,
            },
            adoptionRoadmaps: nextRoadmaps,
          },
          isDirty: true,
        };
      }
      const extras = base.capabilityMap.customCapabilities ?? {};
      const list = extras[found.ownerCategoryId] ?? [];
      const nextList = list.filter((cap) => cap.id !== capabilityId);
      const nextExtras = { ...extras };
      if (nextList.length === 0) delete nextExtras[found.ownerCategoryId];
      else nextExtras[found.ownerCategoryId] = nextList;
      return {
        currentDocument: {
          ...base,
          capabilityMap: {
            ...base.capabilityMap,
            customCapabilities: nextExtras,
            capabilityStatus: nextStatus,
            capabilityNotes: nextNotes,
          },
          adoptionRoadmaps: nextRoadmaps,
        },
        isDirty: true,
      };
    }),

  markDirty: () => set({ isDirty: true }),

  markClean: (savedAt) => set({ isDirty: false, lastSavedAt: savedAt ?? Date.now() }),

  setFilePath: (path) => set({ currentFilePath: path }),

  // ---- Adoption Roadmap actions -------------------------------------------

  addRoadmap: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const newId = makeRoadmapId();
    const defaultColumns: RoadmapColumn[] = [
      { id: makeRoadmapColumnId(), title: 'Now' },
      { id: makeRoadmapColumnId(), title: 'Next' },
      { id: makeRoadmapColumnId(), title: 'Later' },
    ];
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const newRoadmap: AdoptionRoadmap = {
        id: newId,
        name: trimmed,
        columns: defaultColumns,
        swimlanes: [],
        cards: [],
      };
      return {
        currentDocument: {
          ...base,
          adoptionRoadmaps: [...(base.adoptionRoadmaps ?? []), newRoadmap],
        },
        isDirty: true,
      };
    });
    return newId;
  },

  renameRoadmap: (roadmapId, name) =>
    set((state) => {
      const trimmed = name.trim();
      if (!trimmed) return state;
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const idx = roadmaps.findIndex((r) => r.id === roadmapId);
      if (idx < 0 || roadmaps[idx]!.name === trimmed) return state;
      const next = [...roadmaps];
      next[idx] = { ...next[idx]!, name: trimmed };
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    }),

  deleteRoadmap: (roadmapId) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const next = roadmaps.filter((r) => r.id !== roadmapId);
      if (next.length === roadmaps.length) return state;
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    }),

  addRoadmapColumn: (roadmapId, title) => {
    const trimmed = title.trim() || 'New Column';
    const newId = makeRoadmapColumnId();
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const idx = roadmaps.findIndex((r) => r.id === roadmapId);
      if (idx < 0) return state;
      const rm = roadmaps[idx]!;
      const next = [...roadmaps];
      next[idx] = { ...rm, columns: [...rm.columns, { id: newId, title: trimmed }] };
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    });
    return newId;
  },

  renameRoadmapColumn: (roadmapId, columnId, title) =>
    set((state) => {
      const trimmed = title.trim();
      if (!trimmed) return state;
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const rmIdx = roadmaps.findIndex((r) => r.id === roadmapId);
      if (rmIdx < 0) return state;
      const rm = roadmaps[rmIdx]!;
      const colIdx = rm.columns.findIndex((c) => c.id === columnId);
      if (colIdx < 0 || rm.columns[colIdx]!.title === trimmed) return state;
      const nextCols = [...rm.columns];
      nextCols[colIdx] = { ...nextCols[colIdx]!, title: trimmed };
      const next = [...roadmaps];
      next[rmIdx] = { ...rm, columns: nextCols };
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    }),

  deleteRoadmapColumn: (roadmapId, columnId) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const rmIdx = roadmaps.findIndex((r) => r.id === roadmapId);
      if (rmIdx < 0) return state;
      const rm = roadmaps[rmIdx]!;
      const nextCols = rm.columns.filter((c) => c.id !== columnId);
      if (nextCols.length === rm.columns.length) return state;
      // Remove all cards in this column.
      const nextCards = rm.cards.filter((c) => c.columnId !== columnId);
      const next = [...roadmaps];
      next[rmIdx] = { ...rm, columns: nextCols, cards: nextCards };
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    }),

  setRoadmapColumnOrder: (roadmapId, columnIds) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const rmIdx = roadmaps.findIndex((r) => r.id === roadmapId);
      if (rmIdx < 0) return state;
      const rm = roadmaps[rmIdx]!;
      const colMap = new Map(rm.columns.map((c) => [c.id, c]));
      const nextCols = columnIds.map((id) => colMap.get(id)).filter(Boolean) as RoadmapColumn[];
      if (nextCols.length !== rm.columns.length) return state;
      const next = [...roadmaps];
      next[rmIdx] = { ...rm, columns: nextCols };
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    }),

  addRoadmapSwimlane: (roadmapId, title) => {
    const trimmed = title.trim() || 'New Swimlane';
    const newId = makeRoadmapSwimlaneId();
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const rmIdx = roadmaps.findIndex((r) => r.id === roadmapId);
      if (rmIdx < 0) return state;
      const rm = roadmaps[rmIdx]!;
      // When adding the first swimlane, assign all existing null-lane cards to this new lane.
      const isFirstLane = rm.swimlanes.length === 0;
      const nextCards = isFirstLane
        ? rm.cards.map((c) => (c.swimlaneId === null ? { ...c, swimlaneId: newId } : c))
        : rm.cards;
      const next = [...roadmaps];
      next[rmIdx] = {
        ...rm,
        swimlanes: [...rm.swimlanes, { id: newId, title: trimmed }],
        cards: nextCards,
      };
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    });
    return newId;
  },

  renameRoadmapSwimlane: (roadmapId, swimlaneId, title) =>
    set((state) => {
      const trimmed = title.trim();
      if (!trimmed) return state;
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const rmIdx = roadmaps.findIndex((r) => r.id === roadmapId);
      if (rmIdx < 0) return state;
      const rm = roadmaps[rmIdx]!;
      const laneIdx = rm.swimlanes.findIndex((l) => l.id === swimlaneId);
      if (laneIdx < 0 || rm.swimlanes[laneIdx]!.title === trimmed) return state;
      const nextLanes = [...rm.swimlanes];
      nextLanes[laneIdx] = { ...nextLanes[laneIdx]!, title: trimmed };
      const next = [...roadmaps];
      next[rmIdx] = { ...rm, swimlanes: nextLanes };
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    }),

  deleteRoadmapSwimlane: (roadmapId, swimlaneId) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const rmIdx = roadmaps.findIndex((r) => r.id === roadmapId);
      if (rmIdx < 0) return state;
      const rm = roadmaps[rmIdx]!;
      const nextLanes = rm.swimlanes.filter((l) => l.id !== swimlaneId);
      if (nextLanes.length === rm.swimlanes.length) return state;
      // Move orphaned cards: assign to first remaining lane, or null if none left.
      const firstRemaining = nextLanes[0]?.id ?? null;
      const nextCards = rm.cards.map((c) =>
        c.swimlaneId === swimlaneId ? { ...c, swimlaneId: firstRemaining } : c,
      );
      // If no lanes remain, null out all swimlaneIds.
      const finalCards =
        nextLanes.length === 0 ? nextCards.map((c) => ({ ...c, swimlaneId: null })) : nextCards;
      const next = [...roadmaps];
      next[rmIdx] = { ...rm, swimlanes: nextLanes, cards: finalCards };
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    }),

  setRoadmapSwimlaneOrder: (roadmapId, swimlaneIds) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const rmIdx = roadmaps.findIndex((r) => r.id === roadmapId);
      if (rmIdx < 0) return state;
      const rm = roadmaps[rmIdx]!;
      const laneMap = new Map(rm.swimlanes.map((l) => [l.id, l]));
      const nextLanes = swimlaneIds
        .map((id) => laneMap.get(id))
        .filter(Boolean) as RoadmapSwimlane[];
      if (nextLanes.length !== rm.swimlanes.length) return state;
      const next = [...roadmaps];
      next[rmIdx] = { ...rm, swimlanes: nextLanes };
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    }),

  addCapabilitiesToRoadmap: (roadmapId, capabilityIds, columnId, swimlaneId) =>
    set((state) => {
      if (capabilityIds.length === 0) return state;
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const rmIdx = roadmaps.findIndex((r) => r.id === roadmapId);
      if (rmIdx < 0) return state;
      const rm = roadmaps[rmIdx]!;
      // Skip capabilities already on this board.
      const existing = new Set(rm.cards.map((c) => c.capabilityId));
      const toAdd = capabilityIds.filter((id) => !existing.has(id));
      if (toAdd.length === 0) return state;
      const newCards: RoadmapCard[] = toAdd.map((capId) => ({
        id: makeRoadmapCardId(),
        capabilityId: capId,
        columnId,
        swimlaneId,
      }));
      const next = [...roadmaps];
      next[rmIdx] = { ...rm, cards: [...rm.cards, ...newCards] };
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    }),

  moveRoadmapCard: (roadmapId, cardId, columnId, swimlaneId, index) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const rmIdx = roadmaps.findIndex((r) => r.id === roadmapId);
      if (rmIdx < 0) return state;
      const rm = roadmaps[rmIdx]!;
      const updated = applyCardMove(rm, cardId, columnId, swimlaneId, index);
      if (updated === rm) return state;
      const next = [...roadmaps];
      next[rmIdx] = updated;
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    }),

  removeRoadmapCard: (roadmapId, cardId) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const roadmaps = base.adoptionRoadmaps ?? [];
      const rmIdx = roadmaps.findIndex((r) => r.id === roadmapId);
      if (rmIdx < 0) return state;
      const rm = roadmaps[rmIdx]!;
      const nextCards = rm.cards.filter((c) => c.id !== cardId);
      if (nextCards.length === rm.cards.length) return state;
      const next = [...roadmaps];
      next[rmIdx] = { ...rm, cards: nextCards };
      return { currentDocument: { ...base, adoptionRoadmaps: next }, isDirty: true };
    }),
}));

export function fileNameFromPath(path: string | null): string {
  if (!path) return 'Untitled';
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || 'Untitled';
}
