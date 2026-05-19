# Capability Status Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive editing of per-capability status and notes — click-to-edit pills with a popover, bulk operations per category, status filter chips and summary stats — with full `.pamap` round-trip persistence.

**Architecture:** Status state already exists in `CapabilityMapState.capabilityStatus` / `capabilityNotes` and round-trips through `packPamap`/`unpackPamap`. We extend the Zustand store with granular setters (single + bulk), add a `STATUSES` constant + helpers, upgrade `CapabilityPill` to render status visuals and open an anchored popover, and extend `HeaderStrip` with filter chips + summary stats. Filter state is local UI state in `CapabilityMapView` (lives next to `searchTerm`, not persisted).

**Tech Stack:** Next.js 16 / React 19, Zustand 5, TypeScript strict (`noUncheckedIndexedAccess`), Tailwind v3 with CSS-variable-backed `status.*` palette, Vitest 2 (node env, `.test.ts` only), Zod 4.

---

## File Structure

**New files:**

- `renderer/lib/capability-status.ts` — `STATUSES` const, `STATUS_ORDER`, `getCapabilityStatus()` helper, `countCapabilitiesByStatus()` helper.
- `renderer/components/capability-map/StatusPopover.tsx` — anchored popover with status radio group + notes textarea. Click-outside and Escape dismissal.
- `renderer/components/capability-map/StatusFilterChips.tsx` — multi-select filter chip row.
- `renderer/components/capability-map/CategoryBulkMenu.tsx` — "..." menu on category headers with bulk actions.
- `shared/__tests__/capability-status-roundtrip.test.ts` — focused test asserting status+notes survive a `.pamap` round-trip after store mutations.
- `renderer/lib/__tests__/capability-status.test.ts` — unit tests for helpers (requires vitest config update).

**Modified files:**

- `renderer/state/document.ts` — add `setCapabilityStatus`, `setCapabilityNotes`, `setCategoryCapabilityStatuses`, `clearCategoryCapabilityNotes` actions.
- `renderer/components/capability-map/CapabilityPill.tsx` — status color bar + tinted background, click handler, opens popover.
- `renderer/components/capability-map/CategoryCard.tsx` — render bulk menu in header; pass status filter through to pills.
- `renderer/components/capability-map/AiNativeSection.tsx` — apply status filter to AI-native pills (parity with CategoryCard).
- `renderer/components/capability-map/HeaderStrip.tsx` — render summary stats and filter chips; new props for filter set + setter.
- `renderer/components/capability-map/CapabilityMapView.tsx` — own `statusFilter` state; compute summary counts; thread filter to header + cards.
- `vitest.config.ts` — include `.test.tsx` so we can colocate component-area test files (the helper test imports renderer code).

---

## Task 1: Status constants and helpers

**Files:**

- Create: `renderer/lib/capability-status.ts`
- Update: `vitest.config.ts`
- Create: `renderer/lib/__tests__/capability-status.test.ts`

- [ ] **Step 1: Update vitest config to include `.test.tsx`**

Edit `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'dist-electron', 'renderer/.next', 'renderer/out'],
  },
});
```

- [ ] **Step 2: Write failing test for `STATUSES` and helpers**

Create `renderer/lib/__tests__/capability-status.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  STATUSES,
  STATUS_ORDER,
  getCapabilityStatus,
  countCapabilitiesByStatus,
} from '../capability-status';

describe('STATUSES', () => {
  it('lists all six statuses with required fields', () => {
    const ids = STATUSES.map((s) => s.id);
    expect(ids).toEqual([
      'in-use',
      'implementing',
      'planning',
      'not-in-use',
      'no-intent',
      'not-licensed',
    ]);
    for (const s of STATUSES) {
      expect(s.label).toBeTruthy();
      expect(s.color).toMatch(/^var\(--status-/);
      expect(s.description).toBeTruthy();
    }
  });

  it('STATUS_ORDER matches STATUSES ids', () => {
    expect(STATUS_ORDER).toEqual(STATUSES.map((s) => s.id));
  });
});

describe('getCapabilityStatus', () => {
  it('returns the mapped status when present', () => {
    expect(getCapabilityStatus({ foo: 'planning' }, 'foo')).toBe('planning');
  });

  it("defaults to 'not-licensed' when absent", () => {
    expect(getCapabilityStatus({}, 'foo')).toBe('not-licensed');
  });
});

describe('countCapabilitiesByStatus', () => {
  it('counts statuses across given capability ids, defaulting missing to not-licensed', () => {
    const counts = countCapabilitiesByStatus(['a', 'b', 'c', 'd'], {
      a: 'in-use',
      b: 'in-use',
      c: 'planning',
    });
    expect(counts['in-use']).toBe(2);
    expect(counts.planning).toBe(1);
    expect(counts['not-licensed']).toBe(1);
    expect(counts['no-intent']).toBe(0);
    expect(counts.implementing).toBe(0);
    expect(counts['not-in-use']).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- capability-status`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `capability-status.ts`**

Create `renderer/lib/capability-status.ts`:

```typescript
import type { CapabilityStatus } from '../../shared/file-format';

export interface StatusMeta {
  id: CapabilityStatus;
  label: string;
  color: string; // CSS var reference
  description: string;
}

// Ordered for display (filter chips, summary): highest engagement first,
// least engagement last. Default for absent keys is 'not-licensed'.
export const STATUSES: readonly StatusMeta[] = [
  {
    id: 'in-use',
    label: 'In Use',
    color: 'var(--status-in-use)',
    description: 'Live in production today.',
  },
  {
    id: 'implementing',
    label: 'Implementing',
    color: 'var(--status-implementing)',
    description: 'Build or rollout in progress.',
  },
  {
    id: 'planning',
    label: 'Planning',
    color: 'var(--status-planning)',
    description: 'Scoped or scheduled, not yet started.',
  },
  {
    id: 'not-in-use',
    label: 'Not In Use',
    color: 'var(--status-not-in-use)',
    description: 'Licensed but not deployed.',
  },
  {
    id: 'no-intent',
    label: 'No Intent',
    color: 'var(--status-no-intent)',
    description: 'Explicitly out of scope.',
  },
  {
    id: 'not-licensed',
    label: 'Not Licensed',
    color: 'var(--status-not-licensed)',
    description: 'Not entitled today (default).',
  },
] as const;

export const STATUS_ORDER: readonly CapabilityStatus[] = STATUSES.map((s) => s.id);

export const STATUS_META: Record<CapabilityStatus, StatusMeta> = Object.fromEntries(
  STATUSES.map((s) => [s.id, s]),
) as Record<CapabilityStatus, StatusMeta>;

export function getCapabilityStatus(
  capabilityStatus: Record<string, CapabilityStatus>,
  capabilityId: string,
): CapabilityStatus {
  return capabilityStatus[capabilityId] ?? 'not-licensed';
}

export function countCapabilitiesByStatus(
  capabilityIds: readonly string[],
  capabilityStatus: Record<string, CapabilityStatus>,
): Record<CapabilityStatus, number> {
  const counts: Record<CapabilityStatus, number> = {
    'in-use': 0,
    implementing: 0,
    planning: 0,
    'not-in-use': 0,
    'no-intent': 0,
    'not-licensed': 0,
  };
  for (const id of capabilityIds) {
    counts[getCapabilityStatus(capabilityStatus, id)] += 1;
  }
  return counts;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- capability-status`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add renderer/lib/capability-status.ts renderer/lib/__tests__/capability-status.test.ts vitest.config.ts
git commit -m "feat(capability-map): add STATUSES metadata and status helpers"
```

---

## Task 2: Zustand store actions for status and notes

**Files:**

- Modify: `renderer/state/document.ts`
- Create: `renderer/state/__tests__/document.test.ts`

- [ ] **Step 1: Write failing tests for new store actions**

Create `renderer/state/__tests__/document.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useDocumentStore } from '../document';
import { emptyDocument } from '../../../shared/file-format';

function reset() {
  useDocumentStore.setState({
    currentDocument: emptyDocument(),
    currentFilePath: null,
    isDirty: false,
    lastSavedAt: null,
  });
}

describe('setCapabilityStatus', () => {
  beforeEach(reset);

  it('sets a capability status and marks dirty', () => {
    useDocumentStore.getState().setCapabilityStatus('incident-mgmt', 'planning');
    const s = useDocumentStore.getState();
    expect(s.currentDocument?.capabilityMap.capabilityStatus['incident-mgmt']).toBe('planning');
    expect(s.isDirty).toBe(true);
  });

  it('is a no-op when status is unchanged', () => {
    useDocumentStore.getState().setCapabilityStatus('x', 'in-use');
    useDocumentStore.setState({ isDirty: false });
    useDocumentStore.getState().setCapabilityStatus('x', 'in-use');
    expect(useDocumentStore.getState().isDirty).toBe(false);
  });
});

describe('setCapabilityNotes', () => {
  beforeEach(reset);

  it('writes notes and marks dirty', () => {
    useDocumentStore.getState().setCapabilityNotes('change-mgmt', 'Q3 rollout');
    expect(
      useDocumentStore.getState().currentDocument?.capabilityMap.capabilityNotes['change-mgmt'],
    ).toBe('Q3 rollout');
    expect(useDocumentStore.getState().isDirty).toBe(true);
  });

  it('deletes the key when notes are empty', () => {
    useDocumentStore.getState().setCapabilityNotes('x', 'hi');
    useDocumentStore.getState().setCapabilityNotes('x', '');
    expect(
      useDocumentStore.getState().currentDocument?.capabilityMap.capabilityNotes.x,
    ).toBeUndefined();
  });
});

describe('setCategoryCapabilityStatuses', () => {
  beforeEach(reset);

  it('applies status to every provided capability id', () => {
    useDocumentStore.getState().setCategoryCapabilityStatuses(['a', 'b', 'c'], 'planning');
    const map = useDocumentStore.getState().currentDocument!.capabilityMap.capabilityStatus;
    expect(map).toEqual({ a: 'planning', b: 'planning', c: 'planning' });
    expect(useDocumentStore.getState().isDirty).toBe(true);
  });

  it('is a no-op for an empty id list', () => {
    useDocumentStore.getState().setCategoryCapabilityStatuses([], 'in-use');
    expect(useDocumentStore.getState().isDirty).toBe(false);
  });
});

describe('clearCategoryCapabilityNotes', () => {
  beforeEach(reset);

  it('removes notes only for the provided ids', () => {
    useDocumentStore.getState().setCapabilityNotes('a', 'keep');
    useDocumentStore.getState().setCapabilityNotes('b', 'wipe');
    useDocumentStore.getState().setCapabilityNotes('c', 'wipe');
    useDocumentStore.setState({ isDirty: false });
    useDocumentStore.getState().clearCategoryCapabilityNotes(['b', 'c']);
    const notes = useDocumentStore.getState().currentDocument!.capabilityMap.capabilityNotes;
    expect(notes).toEqual({ a: 'keep' });
    expect(useDocumentStore.getState().isDirty).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- state/__tests__/document`
Expected: FAIL — `setCapabilityStatus is not a function`.

- [ ] **Step 3: Add actions to `renderer/state/document.ts`**

Update the `DocumentState` interface and add the implementations. Replace the file with:

```typescript
import { create } from 'zustand';
import { emptyDocument, type CapabilityStatus, type Document } from '../../shared/file-format';

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
  markDirty: () => void;
  markClean: (savedAt?: number) => void;
  setFilePath: (path: string | null) => void;
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
      return {
        currentDocument: {
          ...base,
          capabilityMap: {
            ...base.capabilityMap,
            categoryEnabled: {
              ...base.capabilityMap.categoryEnabled,
              [categoryId]: enabled,
            },
          },
        },
        isDirty: true,
      };
    }),

  setCapabilityStatus: (capabilityId, status) =>
    set((state) => {
      const base = state.currentDocument ?? emptyDocument();
      const current = base.capabilityMap.capabilityStatus[capabilityId];
      if (current === status) return state;
      return {
        currentDocument: {
          ...base,
          capabilityMap: {
            ...base.capabilityMap,
            capabilityStatus: {
              ...base.capabilityMap.capabilityStatus,
              [capabilityId]: status,
            },
          },
        },
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

  markDirty: () => set({ isDirty: true }),

  markClean: (savedAt) => set({ isDirty: false, lastSavedAt: savedAt ?? Date.now() }),

  setFilePath: (path) => set({ currentFilePath: path }),
}));

export function fileNameFromPath(path: string | null): string {
  if (!path) return 'Untitled';
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || 'Untitled';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- state/__tests__/document`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add renderer/state/document.ts renderer/state/__tests__/document.test.ts
git commit -m "feat(state): add capability status/notes setters with bulk variants"
```

---

## Task 3: Persistence round-trip test for status edits

**Files:**

- Create: `shared/__tests__/capability-status-roundtrip.test.ts`

This is the test the spec explicitly requires. The existing `pamap.test.ts` covers schema round-trip; this one drives the store, packs, unpacks, and asserts equality. It depends on Task 2.

- [ ] **Step 1: Write the round-trip test**

Create `shared/__tests__/capability-status-roundtrip.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useDocumentStore } from '../../renderer/state/document';
import { emptyDocument } from '../file-format';
import { packPamap, unpackPamap } from '../pamap';

describe('capability status/notes survive .pamap round-trip', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      currentDocument: emptyDocument(),
      currentFilePath: null,
      isDirty: false,
      lastSavedAt: null,
    });
  });

  it('preserves single-capability status edits', async () => {
    const store = useDocumentStore.getState();
    store.setCustomerName('Acme');
    store.setCapabilityStatus('incident-mgmt', 'in-use');
    store.setCapabilityStatus('change-mgmt', 'planning');
    store.setCapabilityNotes('change-mgmt', 'Q3 rollout');

    const doc = useDocumentStore.getState().currentDocument!;
    const bytes = await packPamap(doc, {
      appVersion: '0.0.1',
      fileId: '11111111-2222-3333-4444-555555555555',
    });
    const bundle = await unpackPamap(bytes);

    expect(bundle.document).toEqual(doc);
    expect(bundle.document.capabilityMap.capabilityStatus).toEqual({
      'incident-mgmt': 'in-use',
      'change-mgmt': 'planning',
    });
    expect(bundle.document.capabilityMap.capabilityNotes).toEqual({
      'change-mgmt': 'Q3 rollout',
    });
  });

  it('preserves bulk status edits and note clears', async () => {
    const store = useDocumentStore.getState();
    store.setCategoryCapabilityStatuses(['a', 'b', 'c'], 'planning');
    store.setCapabilityNotes('a', 'keep');
    store.setCapabilityNotes('b', 'wipe');
    store.clearCategoryCapabilityNotes(['b']);

    const doc = useDocumentStore.getState().currentDocument!;
    const bytes = await packPamap(doc, {
      appVersion: '0.0.1',
      fileId: '99999999-9999-9999-9999-999999999999',
    });
    const bundle = await unpackPamap(bytes);

    expect(bundle.document.capabilityMap.capabilityStatus).toEqual({
      a: 'planning',
      b: 'planning',
      c: 'planning',
    });
    expect(bundle.document.capabilityMap.capabilityNotes).toEqual({ a: 'keep' });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm test -- capability-status-roundtrip`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add shared/__tests__/capability-status-roundtrip.test.ts
git commit -m "test: capability status/notes round-trip through .pamap"
```

---

## Task 4: CapabilityPill — status visualization

Render a 5px left color bar in the status color and a faint background tint. Text stays `text-fg`. Click handler is a prop. Disabled (parent category off) desaturates regardless of status.

**Files:**

- Modify: `renderer/components/capability-map/CapabilityPill.tsx`

- [ ] **Step 1: Rewrite the pill**

Replace `renderer/components/capability-map/CapabilityPill.tsx`:

```typescript
'use client';

import { memo } from 'react';
import type { Capability } from '../../data/types';
import type { CapabilityStatus } from '../../../shared/file-format';
import { STATUS_META } from '../../lib/capability-status';

interface Props {
  capability: Capability;
  status: CapabilityStatus;
  hasNotes: boolean;
  disabled: boolean;
  selected?: boolean;
  onClick?: (capabilityId: string, anchor: HTMLElement) => void;
}

function CapabilityPillImpl({
  capability,
  status,
  hasNotes,
  disabled,
  selected,
  onClick,
}: Props) {
  const meta = STATUS_META[status];
  const interactive = !disabled && Boolean(onClick);

  return (
    <button
      type="button"
      role="listitem"
      aria-label={`${capability.name} — ${meta.label}`}
      title={capability.name}
      disabled={disabled}
      aria-pressed={selected ?? undefined}
      onClick={(e) => {
        if (!interactive) return;
        onClick!(capability.id, e.currentTarget);
      }}
      className={[
        'relative flex h-7 w-full items-center gap-1.5 truncate rounded-sm border border-border pl-3 pr-2 text-left text-xs text-fg',
        'focus:outline-none focus:ring-1 focus:ring-accent',
        disabled ? 'pointer-events-none opacity-50 saturate-0' : 'hover:border-border-strong',
        selected ? 'ring-1 ring-accent' : '',
      ].join(' ')}
      style={{
        // ~7% tint of status color over bg
        backgroundColor: `color-mix(in srgb, ${meta.color} 7%, var(--bg))`,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[5px] rounded-l-sm"
        style={{ backgroundColor: meta.color }}
      />
      <span className="truncate">{capability.name}</span>
      {hasNotes && (
        <span
          aria-label="has notes"
          className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-fg-subtle"
        />
      )}
    </button>
  );
}

export const CapabilityPill = memo(CapabilityPillImpl);
```

- [ ] **Step 2: Verify typecheck (callers will break — expected; fixed in Task 6)**

Run: `pnpm typecheck`
Expected: errors in `CategoryCard.tsx` and `AiNativeSection.tsx` — missing `status` / `hasNotes` props. Do NOT commit yet; carry forward to Task 6.

---

## Task 5: StatusPopover component

A self-contained popover with status radio buttons (each with color swatch) and a notes textarea. Closes on Escape or click-outside. Anchors below its trigger; flips up if there's no room.

**Files:**

- Create: `renderer/components/capability-map/StatusPopover.tsx`

- [ ] **Step 1: Implement the popover**

Create `renderer/components/capability-map/StatusPopover.tsx`:

```typescript
'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CapabilityStatus } from '../../../shared/file-format';
import { STATUSES } from '../../lib/capability-status';

interface Props {
  anchor: HTMLElement;
  capabilityName: string;
  status: CapabilityStatus;
  notes: string;
  onStatusChange: (next: CapabilityStatus) => void;
  onNotesChange: (next: string) => void;
  onClose: () => void;
}

interface Position {
  top: number;
  left: number;
  placement: 'below' | 'above';
}

const POPOVER_WIDTH = 320;
const POPOVER_MARGIN = 8;

function computePosition(anchor: HTMLElement, popoverHeight: number): Position {
  const rect = anchor.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const spaceBelow = viewportH - rect.bottom;
  const spaceAbove = rect.top;
  const placement: 'below' | 'above' =
    spaceBelow >= popoverHeight + POPOVER_MARGIN || spaceBelow >= spaceAbove ? 'below' : 'above';

  const top =
    placement === 'below'
      ? rect.bottom + POPOVER_MARGIN
      : Math.max(POPOVER_MARGIN, rect.top - popoverHeight - POPOVER_MARGIN);

  const left = Math.min(
    Math.max(POPOVER_MARGIN, rect.left),
    viewportW - POPOVER_WIDTH - POPOVER_MARGIN,
  );

  return { top, left, placement };
}

export function StatusPopover({
  anchor,
  capabilityName,
  status,
  notes,
  onStatusChange,
  onNotesChange,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const measured = ref.current.getBoundingClientRect();
    setPos(computePosition(anchor, measured.height));
  }, [anchor]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (ref.current?.contains(target)) return;
      if (anchor.contains(target)) return;
      onClose();
    }
    function onScroll() {
      if (!ref.current) return;
      const measured = ref.current.getBoundingClientRect();
      setPos(computePosition(anchor, measured.height));
    }
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDocClick, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDocClick, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [anchor, onClose]);

  const groupId = `status-radio-${capabilityName.replace(/\s+/g, '-')}`;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Edit ${capabilityName}`}
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: POPOVER_WIDTH,
        visibility: pos ? 'visible' : 'hidden',
        zIndex: 50,
      }}
      className="rounded border border-border-strong bg-bg-elevated p-3 shadow-lg"
    >
      <header className="mb-2 truncate text-sm font-medium text-fg" title={capabilityName}>
        {capabilityName}
      </header>

      <fieldset className="mb-3" role="radiogroup" aria-label="Status">
        <legend className="sr-only">Status</legend>
        <div className="flex flex-col gap-0.5">
          {STATUSES.map((s) => (
            <label
              key={s.id}
              className={[
                'flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-xs hover:bg-bg-sunken',
                status === s.id ? 'bg-bg-sunken' : '',
              ].join(' ')}
            >
              <input
                type="radio"
                name={groupId}
                value={s.id}
                checked={status === s.id}
                onChange={() => onStatusChange(s.id)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-sm border border-border-strong"
                style={{ backgroundColor: s.color }}
              />
              <span className="font-medium text-fg">{s.label}</span>
              <span className="ml-auto truncate text-fg-subtle">{s.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-subtle">
          Notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={4}
          placeholder="Customer-specific context, dates, owners…"
          className="w-full resize-y rounded-sm border border-border bg-bg p-2 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (popover stands alone)**

Run: `pnpm typecheck`
Expected: still errors from Task 4 in CategoryCard/AiNativeSection. No new errors in `StatusPopover.tsx` itself.

---

## Task 6: Wire popover into CapabilityMapView; pass status+notes through

This is the integration step that makes Tasks 4+5 actually render. After this task the app should compile and clicking a pill should open a working popover with live edits.

**Files:**

- Modify: `renderer/components/capability-map/CategoryCard.tsx`
- Modify: `renderer/components/capability-map/AiNativeSection.tsx`
- Modify: `renderer/components/capability-map/CapabilityMapView.tsx`

- [ ] **Step 1: Update `CategoryCard` to pass status, notes flag, and click handler to each pill**

Replace `renderer/components/capability-map/CategoryCard.tsx`:

```typescript
'use client';

import { memo, useMemo } from 'react';
import type { Capability, Category } from '../../data/types';
import type { CapabilityStatus } from '../../../shared/file-format';
import { matchesSearch } from '../../lib/capability-map';
import { getCapabilityStatus } from '../../lib/capability-status';
import { CapabilityPill } from './CapabilityPill';
import { ToggleSwitch } from './ToggleSwitch';

interface Props {
  category: Category;
  capabilities: Capability[];
  enabled: boolean;
  searchTerm: string;
  statusFilter: ReadonlySet<CapabilityStatus>;
  capabilityStatus: Record<string, CapabilityStatus>;
  capabilityNotes: Record<string, string>;
  selectedCapabilityId: string | null;
  onToggle: (next: boolean) => void;
  onPillClick: (capabilityId: string, anchor: HTMLElement) => void;
  headerSlot?: React.ReactNode;
}

function CategoryCardImpl({
  category,
  capabilities,
  enabled,
  searchTerm,
  statusFilter,
  capabilityStatus,
  capabilityNotes,
  selectedCapabilityId,
  onToggle,
  onPillClick,
  headerSlot,
}: Props) {
  const visibleCapabilities = useMemo(() => {
    return capabilities.filter((c) => {
      if (searchTerm && !matchesSearch(c.name, searchTerm)) return false;
      if (statusFilter.size > 0 && !statusFilter.has(getCapabilityStatus(capabilityStatus, c.id))) {
        return false;
      }
      return true;
    });
  }, [capabilities, searchTerm, statusFilter, capabilityStatus]);

  const filteredOut =
    (searchTerm || statusFilter.size > 0) && visibleCapabilities.length === 0 && capabilities.length > 0;

  return (
    <section
      className={[
        'flex flex-col rounded border border-border bg-bg-elevated transition-opacity',
        enabled ? '' : 'opacity-40',
      ].join(' ')}
      aria-label={category.fullName ?? category.name}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
        <h3
          className="truncate text-sm font-medium text-fg"
          title={category.fullName ?? category.name}
        >
          {category.name}
        </h3>
        <div className="flex items-center gap-1.5">
          {headerSlot}
          <ToggleSwitch checked={enabled} onChange={onToggle} label={`Enable ${category.name}`} />
        </div>
      </header>
      <div
        role="list"
        aria-label={`${category.name} capabilities`}
        className="flex flex-col gap-1 p-2"
      >
        {capabilities.length === 0 && (
          <div className="px-1 py-0.5 text-xs italic text-fg-subtle">No capabilities</div>
        )}
        {filteredOut && (
          <div className="px-1 py-0.5 text-xs italic text-fg-subtle">No matches in this category</div>
        )}
        {visibleCapabilities.map((cap) => (
          <CapabilityPill
            key={cap.id}
            capability={cap}
            status={getCapabilityStatus(capabilityStatus, cap.id)}
            hasNotes={Boolean(capabilityNotes[cap.id])}
            disabled={!enabled}
            selected={selectedCapabilityId === cap.id}
            onClick={onPillClick}
          />
        ))}
      </div>
    </section>
  );
}

export const CategoryCard = memo(CategoryCardImpl);
```

- [ ] **Step 2: Update `AiNativeSection` the same way**

Replace `renderer/components/capability-map/AiNativeSection.tsx`:

```typescript
'use client';

import { memo, useMemo } from 'react';
import type { CapabilityStatus } from '../../../shared/file-format';
import { AI_NATIVE_PILLAR_LABELS, groupedSeed, matchesSearch } from '../../lib/capability-map';
import { getCapabilityStatus } from '../../lib/capability-status';
import { CapabilityPill } from './CapabilityPill';

interface Props {
  searchTerm: string;
  statusFilter: ReadonlySet<CapabilityStatus>;
  capabilityStatus: Record<string, CapabilityStatus>;
  capabilityNotes: Record<string, string>;
  selectedCapabilityId: string | null;
  onPillClick: (capabilityId: string, anchor: HTMLElement) => void;
}

function AiNativeSectionImpl({
  searchTerm,
  statusFilter,
  capabilityStatus,
  capabilityNotes,
  selectedCapabilityId,
  onPillClick,
}: Props) {
  const filterCap = (id: string, name: string) => {
    if (searchTerm && !matchesSearch(name, searchTerm)) return false;
    if (statusFilter.size > 0 && !statusFilter.has(getCapabilityStatus(capabilityStatus, id))) {
      return false;
    }
    return true;
  };

  const aiControlTower = useMemo(
    () => groupedSeed.aiControlTower.capabilities.filter((c) => filterCap(c.id, c.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchTerm, statusFilter, capabilityStatus],
  );

  const pillars = useMemo(
    () =>
      groupedSeed.pillars.map((p) => ({
        ...p,
        visibleCapabilities: p.capabilities.filter((c) => filterCap(c.id, c.name)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchTerm, statusFilter, capabilityStatus],
  );

  const showEmptyHint = searchTerm || statusFilter.size > 0;

  return (
    <section
      className="mt-6 flex flex-col gap-3 rounded border border-border bg-bg-sunken p-3"
      aria-label="AI-Native platform"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          AI-Native Platform
        </h2>
        <span className="text-xs text-fg-subtle">Foundation — always relevant</span>
      </div>

      {groupedSeed.aiControlTower.category && (
        <div className="rounded border border-border bg-bg-elevated">
          <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
            <h3 className="text-sm font-medium text-fg">
              {groupedSeed.aiControlTower.category.name}
            </h3>
            <span className="text-xs text-fg-subtle">Spans all pillars</span>
          </div>
          <div
            role="list"
            aria-label="AI Control Tower capabilities"
            className="grid grid-cols-2 gap-1 p-2 sm:grid-cols-3 md:grid-cols-4"
          >
            {aiControlTower.length === 0 && showEmptyHint && (
              <div className="col-span-full px-1 text-xs italic text-fg-subtle">No matches</div>
            )}
            {aiControlTower.map((cap) => (
              <CapabilityPill
                key={cap.id}
                capability={cap}
                status={getCapabilityStatus(capabilityStatus, cap.id)}
                hasNotes={Boolean(capabilityNotes[cap.id])}
                disabled={false}
                selected={selectedCapabilityId === cap.id}
                onClick={onPillClick}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {pillars.map(({ pillar, category, visibleCapabilities }) => (
          <div
            key={pillar}
            className="flex flex-col rounded border border-border bg-bg-elevated"
            aria-label={AI_NATIVE_PILLAR_LABELS[pillar]}
          >
            <header className="border-b border-border px-2.5 py-1.5">
              <h3 className="text-sm font-semibold tracking-wide text-fg">
                {AI_NATIVE_PILLAR_LABELS[pillar]}
              </h3>
              {category?.fullName && <p className="text-xs text-fg-subtle">{category.fullName}</p>}
            </header>
            <div
              role="list"
              aria-label={`${AI_NATIVE_PILLAR_LABELS[pillar]} capabilities`}
              className="flex flex-col gap-1 p-2"
            >
              {visibleCapabilities.length === 0 && (
                <div className="px-1 py-0.5 text-xs italic text-fg-subtle">
                  {showEmptyHint ? 'No matches' : 'No capabilities'}
                </div>
              )}
              {visibleCapabilities.map((cap) => (
                <CapabilityPill
                  key={cap.id}
                  capability={cap}
                  status={getCapabilityStatus(capabilityStatus, cap.id)}
                  hasNotes={Boolean(capabilityNotes[cap.id])}
                  disabled={false}
                  selected={selectedCapabilityId === cap.id}
                  onClick={onPillClick}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export const AiNativeSection = memo(AiNativeSectionImpl);
```

- [ ] **Step 3: Update `CapabilityMapView` to own selection + popover and pass everything through**

Replace `renderer/components/capability-map/CapabilityMapView.tsx`:

```typescript
'use client';

import { useCallback, useMemo, useState } from 'react';
import { emptyDocument } from '../../../shared/file-format';
import type { CapabilityStatus } from '../../../shared/file-format';
import { useDocumentStore } from '../../state/document';
import { groupedSeed, isCategoryEnabled, seed } from '../../lib/capability-map';
import { AiNativeSection } from './AiNativeSection';
import { CategoryCard } from './CategoryCard';
import { HeaderStrip } from './HeaderStrip';
import { StatusPopover } from './StatusPopover';
import { countCapabilitiesByStatus, getCapabilityStatus } from '../../lib/capability-status';

export function CapabilityMapView() {
  const currentDocument = useDocumentStore((s) => s.currentDocument);
  const setCustomerName = useDocumentStore((s) => s.setCustomerName);
  const setCategoryEnabled = useDocumentStore((s) => s.setCategoryEnabled);
  const setCapabilityStatus = useDocumentStore((s) => s.setCapabilityStatus);
  const setCapabilityNotes = useDocumentStore((s) => s.setCapabilityNotes);
  const loadDocument = useDocumentStore((s) => s.loadDocument);
  // setCategoryCapabilityStatuses and clearCategoryCapabilityNotes are wired in Task 8.

  const [searchTermRaw, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [statusFilter, setStatusFilter] = useState<ReadonlySet<CapabilityStatus>>(new Set());
  const [popover, setPopover] = useState<{ id: string; anchor: HTMLElement } | null>(null);

  const searchTerm = searchTermRaw.trim().toLowerCase();

  const doc = currentDocument ?? emptyDocument();
  const customerName = doc.customer.name;
  const categoryEnabled = doc.capabilityMap.categoryEnabled;
  const capabilityStatus = doc.capabilityMap.capabilityStatus;
  const capabilityNotes = doc.capabilityMap.capabilityNotes;

  const solutionCategories = groupedSeed.solutionCategories;

  const { enabledCount, totalCount } = useMemo(() => {
    let enabled = 0;
    for (const cat of solutionCategories) {
      if (isCategoryEnabled(categoryEnabled, cat.id)) enabled += 1;
    }
    return { enabledCount: enabled, totalCount: solutionCategories.length };
  }, [solutionCategories, categoryEnabled]);

  const summary = useMemo(() => {
    const allIds = seed.capabilities.map((c) => c.id);
    return countCapabilitiesByStatus(allIds, capabilityStatus);
  }, [capabilityStatus]);

  const toggleStatusFilter = useCallback((status: CapabilityStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const clearStatusFilter = useCallback(() => setStatusFilter(new Set()), []);

  const handlePillClick = useCallback((capabilityId: string, anchor: HTMLElement) => {
    setPopover((prev) =>
      prev?.id === capabilityId ? null : { id: capabilityId, anchor },
    );
  }, []);

  const closePopover = useCallback(() => setPopover(null), []);

  if (!seed || solutionCategories.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded border border-border bg-bg-elevated p-4 text-center">
          <h2 className="text-sm font-medium text-fg">Capability map failed to load</h2>
          <p className="mt-1 text-xs text-fg-muted">The bundled seed JSON could not be parsed.</p>
          <button
            type="button"
            onClick={() => loadDocument(emptyDocument(), null)}
            className="mt-3 inline-flex h-7 items-center rounded-sm bg-accent px-3 text-xs font-medium text-accent-fg hover:opacity-90"
          >
            Reset to default seed
          </button>
        </div>
      </div>
    );
  }

  const selectedCapability = popover
    ? seed.capabilities.find((c) => c.id === popover.id) ?? null
    : null;

  return (
    <div className="flex h-full flex-col">
      <HeaderStrip
        customerName={customerName}
        onCustomerNameChange={setCustomerName}
        enabledCount={enabledCount}
        totalCount={totalCount}
        searchTerm={searchTermRaw}
        onSearchChange={setSearchTerm}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        statusSummary={summary}
        statusFilter={statusFilter}
        onToggleStatusFilter={toggleStatusFilter}
        onClearStatusFilter={clearStatusFilter}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {viewMode === 'list' ? (
          <div className="p-4 text-sm text-fg-muted">
            List view coming soon. Switch to <span className="font-medium">Grid</span> to see the
            capability map.
          </div>
        ) : (
          <div className="p-4">
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
            >
              {solutionCategories.map((cat) => {
                const enabled = isCategoryEnabled(categoryEnabled, cat.id);
                const capabilities = groupedSeed.capabilitiesByCategory.get(cat.id) ?? [];
                return (
                  <CategoryCard
                    key={cat.id}
                    category={cat}
                    capabilities={capabilities}
                    enabled={enabled}
                    searchTerm={searchTerm}
                    statusFilter={statusFilter}
                    capabilityStatus={capabilityStatus}
                    capabilityNotes={capabilityNotes}
                    selectedCapabilityId={popover?.id ?? null}
                    onToggle={(next) => setCategoryEnabled(cat.id, next)}
                    onPillClick={handlePillClick}
                  />
                );
              })}
            </div>

            <AiNativeSection
              searchTerm={searchTerm}
              statusFilter={statusFilter}
              capabilityStatus={capabilityStatus}
              capabilityNotes={capabilityNotes}
              selectedCapabilityId={popover?.id ?? null}
              onPillClick={handlePillClick}
            />
          </div>
        )}
      </div>

      {popover && selectedCapability && (
        <StatusPopover
          anchor={popover.anchor}
          capabilityName={selectedCapability.name}
          status={getCapabilityStatus(capabilityStatus, popover.id)}
          notes={capabilityNotes[popover.id] ?? ''}
          onStatusChange={(next) => setCapabilityStatus(popover.id, next)}
          onNotesChange={(next) => setCapabilityNotes(popover.id, next)}
          onClose={closePopover}
        />
      )}
    </div>
  );
}

```

- [ ] **Step 4: Update `HeaderStrip` to accept the new props (stub UI for now — finished in Task 7)**

Edit `renderer/components/capability-map/HeaderStrip.tsx`. Update the `Props` interface and accept the new fields, even if not yet rendered:

```typescript
import type { CapabilityStatus } from '../../../shared/file-format';
// ...
interface Props {
  customerName: string;
  onCustomerNameChange: (next: string) => void;
  enabledCount: number;
  totalCount: number;
  searchTerm: string;
  onSearchChange: (next: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (next: 'grid' | 'list') => void;
  statusSummary: Record<CapabilityStatus, number>;
  statusFilter: ReadonlySet<CapabilityStatus>;
  onToggleStatusFilter: (status: CapabilityStatus) => void;
  onClearStatusFilter: () => void;
}
```

Add the props to the destructure list. Final visual wiring lands in Task 7.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Tests**

Run: `pnpm test`
Expected: all passing.

- [ ] **Step 7: Run the dev server and verify manually**

Run: `pnpm dev`

- Click any capability pill → popover opens anchored to the pill, with the radio group highlighting current status.
- Change status → pill's color bar and tint update immediately; popover stays open.
- Type in notes → notes textarea reflects edits; closing and re-opening the pill shows the saved notes.
- Press Escape or click outside → popover closes.

Stop the dev server when verified (Ctrl-C).

- [ ] **Step 8: Commit**

```bash
git add renderer/components/capability-map/CapabilityPill.tsx renderer/components/capability-map/CategoryCard.tsx renderer/components/capability-map/AiNativeSection.tsx renderer/components/capability-map/CapabilityMapView.tsx renderer/components/capability-map/StatusPopover.tsx renderer/components/capability-map/HeaderStrip.tsx
git commit -m "feat(capability-map): click-to-edit status popover with notes"
```

---

## Task 7: Filter chips and summary stats in HeaderStrip

**Files:**

- Create: `renderer/components/capability-map/StatusFilterChips.tsx`
- Modify: `renderer/components/capability-map/HeaderStrip.tsx`

- [ ] **Step 1: Implement `StatusFilterChips`**

Create `renderer/components/capability-map/StatusFilterChips.tsx`:

```typescript
'use client';

import { memo } from 'react';
import type { CapabilityStatus } from '../../../shared/file-format';
import { STATUSES } from '../../lib/capability-status';

interface Props {
  filter: ReadonlySet<CapabilityStatus>;
  onToggle: (status: CapabilityStatus) => void;
  onClear: () => void;
}

function StatusFilterChipsImpl({ filter, onToggle, onClear }: Props) {
  const allSelected = filter.size === 0;
  return (
    <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={onClear}
        aria-pressed={allSelected}
        className={[
          'h-7 rounded-full border px-2.5 text-xs',
          allSelected
            ? 'border-accent bg-accent text-accent-fg'
            : 'border-border bg-bg text-fg-muted hover:bg-bg-sunken hover:text-fg',
        ].join(' ')}
      >
        All
      </button>
      {STATUSES.map((s) => {
        const active = filter.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            aria-pressed={active}
            className={[
              'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs',
              active
                ? 'border-fg-muted bg-bg-sunken text-fg'
                : 'border-border bg-bg text-fg-muted hover:bg-bg-sunken hover:text-fg',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export const StatusFilterChips = memo(StatusFilterChipsImpl);
```

- [ ] **Step 2: Render summary stats and chips in `HeaderStrip`**

Replace the full `renderer/components/capability-map/HeaderStrip.tsx`:

```typescript
'use client';

import { Search } from 'lucide-react';
import type { CapabilityStatus } from '../../../shared/file-format';
import { STATUSES } from '../../lib/capability-status';
import { StatusFilterChips } from './StatusFilterChips';

interface Props {
  customerName: string;
  onCustomerNameChange: (next: string) => void;
  enabledCount: number;
  totalCount: number;
  searchTerm: string;
  onSearchChange: (next: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (next: 'grid' | 'list') => void;
  statusSummary: Record<CapabilityStatus, number>;
  statusFilter: ReadonlySet<CapabilityStatus>;
  onToggleStatusFilter: (status: CapabilityStatus) => void;
  onClearStatusFilter: () => void;
}

export function HeaderStrip({
  customerName,
  onCustomerNameChange,
  enabledCount,
  totalCount,
  searchTerm,
  onSearchChange,
  viewMode,
  onViewModeChange,
  statusSummary,
  statusFilter,
  onToggleStatusFilter,
  onClearStatusFilter,
}: Props) {
  return (
    <div className="flex flex-col gap-2 border-b border-border bg-bg-elevated px-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
            Customer
          </span>
          <input
            type="text"
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            placeholder="Untitled"
            className="h-7 w-56 rounded-sm border border-border bg-bg px-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
          />
        </label>

        <div className="text-xs text-fg-muted" aria-live="polite">
          Categories: <span className="font-medium text-fg">{enabledCount}</span> of{' '}
          <span className="font-medium text-fg">{totalCount}</span> enabled
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
          {STATUSES.map((s, idx) => {
            const active = statusFilter.has(s.id);
            return (
              <span key={s.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onToggleStatusFilter(s.id)}
                  aria-pressed={active}
                  className={[
                    'flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-bg-sunken',
                    active ? 'bg-bg-sunken text-fg' : '',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-sm"
                    style={{ backgroundColor: s.color }}
                  />
                  <span>{s.label}:</span>
                  <span className="font-medium text-fg">{statusSummary[s.id]}</span>
                </button>
                {idx < STATUSES.length - 1 && <span aria-hidden="true">·</span>}
              </span>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <label className="relative flex items-center">
            <Search size={13} className="pointer-events-none absolute left-2 text-fg-subtle" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search capabilities…"
              aria-label="Search capabilities"
              className="h-7 w-56 rounded-sm border border-border bg-bg pl-7 pr-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
            />
          </label>

          <div
            role="group"
            aria-label="View mode"
            className="inline-flex overflow-hidden rounded-sm border border-border"
          >
            {(['grid', 'list'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewModeChange(mode)}
                aria-pressed={viewMode === mode}
                className={[
                  'h-7 px-2.5 text-xs capitalize',
                  viewMode === mode
                    ? 'bg-accent text-accent-fg'
                    : 'bg-bg text-fg-muted hover:bg-bg-sunken hover:text-fg',
                ].join(' ')}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      <StatusFilterChips
        filter={statusFilter}
        onToggle={onToggleStatusFilter}
        onClear={onClearStatusFilter}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and tests**

Run: `pnpm typecheck && pnpm test`
Expected: no errors, all passing.

- [ ] **Step 4: Manual verification with dev server**

Run: `pnpm dev`

- Summary stats appear in header strip with correct counts.
- Clicking a stat toggles its filter chip (and vice versa).
- Multiple chips can be selected simultaneously.
- Filter combines with the search box (intersection).
- "All" clears all selected chips.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add renderer/components/capability-map/HeaderStrip.tsx renderer/components/capability-map/StatusFilterChips.tsx
git commit -m "feat(capability-map): status filter chips and summary stats in header"
```

---

## Task 8: Bulk operations menu in CategoryCard header

**Files:**

- Create: `renderer/components/capability-map/CategoryBulkMenu.tsx`
- Modify: `renderer/components/capability-map/CategoryCard.tsx`
- Modify: `renderer/components/capability-map/CapabilityMapView.tsx`

- [ ] **Step 1: Implement the bulk menu**

Create `renderer/components/capability-map/CategoryBulkMenu.tsx`:

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import type { CapabilityStatus } from '../../../shared/file-format';

interface Props {
  categoryName: string;
  onSetAllStatus: (status: CapabilityStatus) => void;
  onClearNotes: () => void;
}

const BULK_STATUS_OPTIONS: { status: CapabilityStatus; label: string }[] = [
  { status: 'not-licensed', label: 'Set all to Not Licensed' },
  { status: 'planning', label: 'Set all to Planning' },
  { status: 'in-use', label: 'Set all to In Use' },
];

export function CategoryBulkMenu({ categoryName, onSetAllStatus, onClearNotes }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  function handleClearNotes() {
    setOpen(false);
    const ok = window.confirm(`Clear all notes in ${categoryName}? This cannot be undone.`);
    if (ok) onClearNotes();
  }

  function handleSetAll(status: CapabilityStatus) {
    setOpen(false);
    onSetAllStatus(status);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${categoryName} bulk actions`}
        className="flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted hover:bg-bg-sunken hover:text-fg focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-56 rounded border border-border-strong bg-bg-elevated p-1 shadow-lg"
        >
          {BULK_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.status}
              type="button"
              role="menuitem"
              onClick={() => handleSetAll(opt.status)}
              className="block w-full rounded-sm px-2 py-1 text-left text-xs text-fg hover:bg-bg-sunken"
            >
              {opt.label}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={handleClearNotes}
            className="block w-full rounded-sm px-2 py-1 text-left text-xs text-fg hover:bg-bg-sunken"
          >
            Clear notes
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the menu into `CategoryCard`**

Edit `renderer/components/capability-map/CategoryCard.tsx`. Add to `Props`:

```typescript
import type { CapabilityStatus } from '../../../shared/file-format';
import { CategoryBulkMenu } from './CategoryBulkMenu';
// ...
interface Props {
  // ...existing fields...
  onBulkSetStatus: (capabilityIds: string[], status: CapabilityStatus) => void;
  onBulkClearNotes: (capabilityIds: string[]) => void;
}
```

Replace the destructure list to include the new props, and update the `headerSlot` content. Replace `headerSlot={headerSlot}` consumption: instead of receiving `headerSlot` from outside (drop that prop), render the bulk menu directly inside the header:

```typescript
<header className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
  <h3
    className="truncate text-sm font-medium text-fg"
    title={category.fullName ?? category.name}
  >
    {category.name}
  </h3>
  <div className="flex items-center gap-1.5">
    {capabilities.length > 0 && (
      <CategoryBulkMenu
        categoryName={category.name}
        onSetAllStatus={(status) =>
          onBulkSetStatus(
            capabilities.map((c) => c.id),
            status,
          )
        }
        onClearNotes={() => onBulkClearNotes(capabilities.map((c) => c.id))}
      />
    )}
    <ToggleSwitch checked={enabled} onChange={onToggle} label={`Enable ${category.name}`} />
  </div>
</header>
```

Remove the `headerSlot?: React.ReactNode` prop from `Props` and the destructure list — it's superseded.

- [ ] **Step 3: Pass bulk handlers from `CapabilityMapView`**

In `renderer/components/capability-map/CapabilityMapView.tsx`, add two more store selectors next to `setCapabilityStatus` / `setCapabilityNotes`:

```typescript
const setCategoryCapabilityStatuses = useDocumentStore((s) => s.setCategoryCapabilityStatuses);
const clearCategoryCapabilityNotes = useDocumentStore((s) => s.clearCategoryCapabilityNotes);
```

Then thread them into `<CategoryCard>`:

```typescript
<CategoryCard
  key={cat.id}
  category={cat}
  capabilities={capabilities}
  enabled={enabled}
  searchTerm={searchTerm}
  statusFilter={statusFilter}
  capabilityStatus={capabilityStatus}
  capabilityNotes={capabilityNotes}
  selectedCapabilityId={popover?.id ?? null}
  onToggle={(next) => setCategoryEnabled(cat.id, next)}
  onPillClick={handlePillClick}
  onBulkSetStatus={(ids, status) => setCategoryCapabilityStatuses(ids, status)}
  onBulkClearNotes={(ids) => clearCategoryCapabilityNotes(ids)}
/>
```

- [ ] **Step 4: Typecheck and tests**

Run: `pnpm typecheck && pnpm test`
Expected: no errors, all passing.

- [ ] **Step 5: Manual verification with dev server**

Run: `pnpm dev`

- Click the "⋯" button in a category header → menu opens with three "Set all to …" options plus "Clear notes".
- "Set all to Planning" → every pill in that category turns to Planning color; other categories untouched.
- "Clear notes" → confirm dialog, then category notes vanish (verify via the popover on a pill that previously had notes).
- Click outside / Escape closes the menu.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add renderer/components/capability-map/CategoryBulkMenu.tsx renderer/components/capability-map/CategoryCard.tsx renderer/components/capability-map/CapabilityMapView.tsx
git commit -m "feat(capability-map): per-category bulk status and clear-notes actions"
```

---

## Task 9: Final acceptance check

**Files:** none modified.

This re-runs the explicit acceptance criteria from the spec.

- [ ] **Step 1: Run full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 2: Run dev server and walk the acceptance script**

Run: `pnpm dev`

Confirm each of the spec's "When I can" items:

1. **Click a pill, change its status, see the color update immediately.** Click any pill → popover. Click a different status in the radio group. The pill's color bar and tint change while the popover is still open. The dirty indicator in the status bar should flip on.

2. **Add a note, save, reopen, see the note.** Type into the notes textarea. Use the app's existing Save action (Cmd/Ctrl+S, or menu) to write a `.pamap`. Close the file (or restart the app). Reopen the same `.pamap`. Click the same pill — the notes you typed should appear unchanged. (This is also covered by the test in Task 3.)

3. **Use the bulk "set category to Planning" action.** Open a category's "⋯" menu → "Set all to Planning". Every pill in that category turns blue. The summary stats in the header update accordingly.

4. **Filter the grid by status.** Click the "Planning" chip (or the "Planning: N" stat). Only Planning pills remain visible across the grid. Click "All" to clear. Combine with the search box: typing in search further restricts visible pills.

Stop the dev server.

- [ ] **Step 3: No commit needed — feature complete.**

If you need a marker commit:

```bash
git commit --allow-empty -m "chore: capability status editing feature complete"
```

---

## Notes for the implementing engineer

- **`noUncheckedIndexedAccess` is on.** Any time you index a `Record<string, X>`, the type is `X | undefined`. The new code already accounts for this — keep doing the same. Don't add `!` non-null assertions; use `?? defaultValue`.
- **`color-mix` in CSS** is supported in all current Electron versions (Chromium >= 111). Don't replace it with rgba math.
- **The popover is fixed-positioned** so it works regardless of overflow/scroll containers. It re-computes position on scroll/resize.
- **Filter state is local UI state**, not part of the document. It must not be persisted or sent to the store.
- **Default status semantics:** `not-licensed` is the absent-key default. Do _not_ eagerly populate every capability id in the map — that would bloat saved files and break the "absent = not-licensed" contract.
- **Bulk "Set all to X" intentionally writes explicit keys** for every capability in the category, even if the new status is `not-licensed`. That's fine — they're still small.
- The existing `pamap.test.ts` already tests schema-level round-trip; the new test in Task 3 specifically exercises the store→pack→unpack flow.
