'use client';

import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { emptyDocument } from '../../../shared/file-format';
import type { CapabilityStatus } from '../../../shared/file-format';
import { useDocumentStore } from '../../state/document';
import {
  groupedSeed,
  isCategoryEnabled,
  partitionCategories,
  seed,
} from '../../lib/capability-map';
import { countCapabilitiesByStatus, getCapabilityStatus } from '../../lib/capability-status';
import { AiNativeSection } from './AiNativeSection';
import { CategoryCard } from './CategoryCard';
import { HeaderStrip } from './HeaderStrip';
import { SortableCategoryCard } from './SortableCategoryCard';
import { StatusPopover } from './StatusPopover';

const GRID_STYLE: React.CSSProperties = {
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
};

export function CapabilityMapView() {
  const currentDocument = useDocumentStore((s) => s.currentDocument);
  const setCustomerName = useDocumentStore((s) => s.setCustomerName);
  const setCategoryEnabled = useDocumentStore((s) => s.setCategoryEnabled);
  const setCapabilityStatus = useDocumentStore((s) => s.setCapabilityStatus);
  const setCapabilityNotes = useDocumentStore((s) => s.setCapabilityNotes);
  const loadDocument = useDocumentStore((s) => s.loadDocument);
  const setCategoryCapabilityStatuses = useDocumentStore((s) => s.setCategoryCapabilityStatuses);
  const clearCategoryCapabilityNotes = useDocumentStore((s) => s.clearCategoryCapabilityNotes);
  const setCategoryOrder = useDocumentStore((s) => s.setCategoryOrder);

  const [searchTermRaw, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [statusFilter, setStatusFilter] = useState<ReadonlySet<CapabilityStatus>>(new Set());
  const [popover, setPopover] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  // dnd-kit assigns aria-describedby ids from a global counter that differs
  // between SSR and client; defer mounting the DndContext until after hydration.
  const [dndMounted, setDndMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration guard
  useEffect(() => setDndMounted(true), []);

  const searchTerm = searchTermRaw.trim().toLowerCase();

  const doc = currentDocument ?? emptyDocument();
  const customerName = doc.customer.name;
  const categoryEnabled = doc.capabilityMap.categoryEnabled;
  const capabilityStatus = doc.capabilityMap.capabilityStatus;
  const capabilityNotes = doc.capabilityMap.capabilityNotes;

  const solutionCategories = groupedSeed.solutionCategories;

  const { active: activeCategories, unlicensed: unlicensedCategories } = useMemo(
    () => partitionCategories(solutionCategories, doc.capabilityMap),
    [solutionCategories, doc.capabilityMap],
  );

  const activeIds = useMemo(() => activeCategories.map((c) => c.id), [activeCategories]);
  const unlicensedIds = useMemo(
    () => unlicensedCategories.map((c) => c.id),
    [unlicensedCategories],
  );

  const { enabledCount, totalCount } = useMemo(() => {
    let enabled = 0;
    for (const cat of solutionCategories) {
      if (isCategoryEnabled(categoryEnabled, cat.id)) enabled += 1;
    }
    return { enabledCount: enabled, totalCount: solutionCategories.length };
  }, [solutionCategories, categoryEnabled]);

  const summary = useMemo(() => {
    const allIds = groupedSeed.allCapabilities.map((c) => c.id);
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
    setPopover((prev) => (prev?.id === capabilityId ? null : { id: capabilityId, anchor }));
  }, []);

  const closePopover = useCallback(() => setPopover(null), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      const inActive = activeIds.includes(activeId);
      const inUnlicensed = unlicensedIds.includes(activeId);
      const overInActive = activeIds.includes(overId);
      const overInUnlicensed = unlicensedIds.includes(overId);

      let newActive = activeIds;
      let newUnlicensed = unlicensedIds;
      if (inActive && overInActive) {
        const from = activeIds.indexOf(activeId);
        const to = activeIds.indexOf(overId);
        newActive = arrayMove(activeIds, from, to);
      } else if (inUnlicensed && overInUnlicensed) {
        const from = unlicensedIds.indexOf(activeId);
        const to = unlicensedIds.indexOf(overId);
        newUnlicensed = arrayMove(unlicensedIds, from, to);
      } else {
        return; // cross-section drag — ignore
      }

      setCategoryOrder([...newActive, ...newUnlicensed]);
    },
    [activeIds, unlicensedIds, setCategoryOrder],
  );

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
    ? (groupedSeed.allCapabilities.find((c) => c.id === popover.id) ?? null)
    : null;

  const renderCard = (cat: (typeof solutionCategories)[number]) => {
    const enabled = isCategoryEnabled(categoryEnabled, cat.id);
    const capabilities = groupedSeed.capabilitiesByCategory.get(cat.id) ?? [];
    const Card = dndMounted ? SortableCategoryCard : CategoryCard;
    return (
      <Card
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
    );
  };

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
            {dndMounted ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToParentElement]}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={activeIds} strategy={rectSortingStrategy}>
                  <div className="grid gap-3" style={GRID_STYLE}>
                    {activeCategories.map(renderCard)}
                  </div>
                </SortableContext>

                {unlicensedCategories.length > 0 && (
                  <>
                    <div className="mt-6 mb-2 flex items-center gap-2 border-b border-border pb-1.5">
                      <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                        Unlicensed
                      </h2>
                      <span className="text-xs text-fg-subtle">
                        ({unlicensedCategories.length})
                      </span>
                    </div>
                    <SortableContext items={unlicensedIds} strategy={rectSortingStrategy}>
                      <div className="grid gap-3" style={GRID_STYLE}>
                        {unlicensedCategories.map(renderCard)}
                      </div>
                    </SortableContext>
                  </>
                )}
              </DndContext>
            ) : (
              <>
                <div className="grid gap-3" style={GRID_STYLE}>
                  {activeCategories.map(renderCard)}
                </div>
                {unlicensedCategories.length > 0 && (
                  <>
                    <div className="mt-6 mb-2 flex items-center gap-2 border-b border-border pb-1.5">
                      <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                        Unlicensed
                      </h2>
                      <span className="text-xs text-fg-subtle">
                        ({unlicensedCategories.length})
                      </span>
                    </div>
                    <div className="grid gap-3" style={GRID_STYLE}>
                      {unlicensedCategories.map(renderCard)}
                    </div>
                  </>
                )}
              </>
            )}

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
