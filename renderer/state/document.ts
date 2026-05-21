import { create } from 'zustand';
import { emptyDocument, type CapabilityStatus, type Document } from '../../shared/file-format';
import { capabilityToCategoryId, groupedSeed, isCategoryUnlicensed } from '../lib/capability-map';

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
  markDirty: () => void;
  markClean: (savedAt?: number) => void;
  setFilePath: (path: string | null) => void;
}

function categoryUnlicensedIn(doc: Document, categoryId: string): boolean {
  const caps = groupedSeed.capabilitiesByCategory.get(categoryId) ?? [];
  return isCategoryUnlicensed(doc.capabilityMap, categoryId, caps);
}

// After a state change, reposition any affected categories whose section
// membership flipped: Active→Unlicensed sends the id to the end of the
// Unlicensed segment (end of categoryOrder); Unlicensed→Active sends it to the
// end of the Active segment (just after the last currently-active id).
function applyTransitions(
  before: Document,
  after: Document,
  affectedCategoryIds: readonly string[],
): Document {
  if (affectedCategoryIds.length === 0) return after;
  // Canonical full order: existing order + missing solution categories in seed order.
  const existing = after.capabilityMap.categoryOrder;
  const present = new Set(existing);
  const fullOrder: string[] = [...existing];
  for (const c of groupedSeed.solutionCategories) {
    if (!present.has(c.id)) fullOrder.push(c.id);
  }

  let nextOrder = fullOrder;
  let mutated = false;
  for (const categoryId of affectedCategoryIds) {
    if (!groupedSeed.capabilitiesByCategory.has(categoryId)) continue;
    // Only solution categories are reorderable.
    const isSolution = groupedSeed.solutionCategories.some((c) => c.id === categoryId);
    if (!isSolution) continue;

    const wasUnlicensed = categoryUnlicensedIn(before, categoryId);
    const isUnlicensed = categoryUnlicensedIn(after, categoryId);
    if (wasUnlicensed === isUnlicensed) continue;

    const withoutAffected = nextOrder.filter((id) => id !== categoryId);
    if (isUnlicensed) {
      nextOrder = [...withoutAffected, categoryId];
    } else {
      let insertAt = 0;
      for (let i = withoutAffected.length - 1; i >= 0; i--) {
        const otherId = withoutAffected[i];
        if (otherId && !categoryUnlicensedIn(after, otherId)) {
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

function uniqueCategoryIdsForCapabilities(capabilityIds: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const cid of capabilityIds) {
    const catId = capabilityToCategoryId.get(cid);
    if (catId) ids.add(catId);
  }
  return Array.from(ids);
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
      const catId = capabilityToCategoryId.get(capabilityId);
      return {
        currentDocument: applyTransitions(base, after, catId ? [catId] : []),
        isDirty: true,
      };
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
      const after: Document = {
        ...base,
        capabilityMap: { ...base.capabilityMap, capabilityStatus: nextStatus },
      };
      const affectedCategories = uniqueCategoryIdsForCapabilities(capabilityIds);
      return {
        currentDocument: applyTransitions(base, after, affectedCategories),
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

  markDirty: () => set({ isDirty: true }),

  markClean: (savedAt) => set({ isDirty: false, lastSavedAt: savedAt ?? Date.now() }),

  setFilePath: (path) => set({ currentFilePath: path }),
}));

export function fileNameFromPath(path: string | null): string {
  if (!path) return 'Untitled';
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || 'Untitled';
}
