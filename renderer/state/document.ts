import { create } from 'zustand';
import {
  emptyDocument,
  type CapabilityStatus,
  type CustomCapability,
  type CustomCategory,
  type Document,
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
}

function makeCustomCategoryId(): string {
  return `custom-cat-${crypto.randomUUID()}`;
}

function makeCustomCapabilityId(): string {
  return `custom-cap-${crypto.randomUUID()}`;
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
