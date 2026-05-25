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
  getAllEffectiveCapabilities,
  getEffectiveCapabilitiesForCategory,
  getEffectiveSolutionCategories,
  groupedSeed,
  isCategoryEnabled,
  isCustomCapabilityId,
  isCustomCategoryId,
  partitionCategories,
  seed,
} from '../../lib/capability-map';
import {
  computeAdoption,
  countCapabilitiesByStatus,
  getCapabilityStatus,
} from '../../lib/capability-status';
import { exportCapabilityMap, type ExportFormat } from '../../lib/export';
import { AddCategoryTile } from './AddCategoryTile';
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
  const addCustomCategory = useDocumentStore((s) => s.addCustomCategory);
  const renameCustomCategory = useDocumentStore((s) => s.renameCustomCategory);
  const deleteCustomCategory = useDocumentStore((s) => s.deleteCustomCategory);
  const addCapabilityToCategory = useDocumentStore((s) => s.addCapabilityToCategory);
  const renameCapability = useDocumentStore((s) => s.renameCapability);
  const deleteCapability = useDocumentStore((s) => s.deleteCapability);

  const [searchTermRaw, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [statusFilter, setStatusFilter] = useState<ReadonlySet<CapabilityStatus>>(new Set());
  const [popover, setPopover] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [exportBusyFormat, setExportBusyFormat] = useState<ExportFormat | null>(null);
  // dnd-kit assigns aria-describedby ids from a global counter that differs
  // between SSR and client; defer mounting the DndContext until after hydration.
  const [dndMounted, setDndMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration guard
  useEffect(() => setDndMounted(true), []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const searchTerm = searchTermRaw.trim().toLowerCase();

  const doc = currentDocument ?? emptyDocument();
  const customerName = doc.customer.name;
  const categoryEnabled = doc.capabilityMap.categoryEnabled;
  const capabilityStatus = doc.capabilityMap.capabilityStatus;
  const capabilityNotes = doc.capabilityMap.capabilityNotes;

  const solutionCategories = useMemo(
    () => getEffectiveSolutionCategories(doc.capabilityMap),
    [doc.capabilityMap],
  );

  const { active: activeCategories, inactive: inactiveCategories } = useMemo(
    () => partitionCategories(solutionCategories, doc.capabilityMap),
    [solutionCategories, doc.capabilityMap],
  );

  const activeIds = useMemo(() => activeCategories.map((c) => c.id), [activeCategories]);
  const inactiveIds = useMemo(() => inactiveCategories.map((c) => c.id), [inactiveCategories]);

  const { enabledCount, totalCount } = useMemo(() => {
    let enabled = 0;
    for (const cat of solutionCategories) {
      if (isCategoryEnabled(categoryEnabled, cat.id)) enabled += 1;
    }
    return { enabledCount: enabled, totalCount: solutionCategories.length };
  }, [solutionCategories, categoryEnabled]);

  const allEffectiveCapabilities = useMemo(
    () => getAllEffectiveCapabilities(doc.capabilityMap),
    [doc.capabilityMap],
  );

  const summary = useMemo(() => {
    const allIds = allEffectiveCapabilities.map((c) => c.id);
    return countCapabilitiesByStatus(allIds, capabilityStatus);
  }, [allEffectiveCapabilities, capabilityStatus]);

  // Adoption % deliberately excludes custom items: customer-added
  // categories/capabilities don't represent the seed offering being measured.
  const adoption = useMemo(
    () =>
      computeAdoption(
        groupedSeed.allCapabilities.map((c) => c.id),
        capabilityStatus,
      ),
    [capabilityStatus],
  );

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

  const handleCategoryToggle = useCallback(
    (catId: string, catName: string, next: boolean) => {
      if (next) {
        setCategoryEnabled(catId, true);
        return;
      }
      setLeavingIds((prev) => {
        const out = new Set(prev);
        out.add(catId);
        return out;
      });
      window.setTimeout(() => {
        setCategoryEnabled(catId, false);
        setLeavingIds((prev) => {
          if (!prev.has(catId)) return prev;
          const out = new Set(prev);
          out.delete(catId);
          return out;
        });
        setToast(`${catName} moved to Inactive`);
      }, 220);
    },
    [setCategoryEnabled],
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (exportBusyFormat) return;
      setExportBusyFormat(format);
      try {
        const result = await exportCapabilityMap(doc, format);
        if (result.ok) {
          setToast(`Exported ${format.toUpperCase()}`);
        } else if (result.cancelled) {
          // No toast on cancel.
        } else {
          setToast(`Export failed: ${result.errorMessage ?? 'unknown error'}`);
        }
      } catch (err) {
        setToast(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setExportBusyFormat(null);
      }
    },
    [doc, exportBusyFormat],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      const inActive = activeIds.includes(activeId);
      const inInactive = inactiveIds.includes(activeId);
      const overInActive = activeIds.includes(overId);
      const overInInactive = inactiveIds.includes(overId);

      let newActive = activeIds;
      let newInactive = inactiveIds;
      if (inActive && overInActive) {
        const from = activeIds.indexOf(activeId);
        const to = activeIds.indexOf(overId);
        newActive = arrayMove(activeIds, from, to);
      } else if (inInactive && overInInactive) {
        const from = inactiveIds.indexOf(activeId);
        const to = inactiveIds.indexOf(overId);
        newInactive = arrayMove(inactiveIds, from, to);
      } else {
        return; // cross-section drag — ignore
      }

      setCategoryOrder([...newActive, ...newInactive]);
    },
    [activeIds, inactiveIds, setCategoryOrder],
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
    ? (allEffectiveCapabilities.find((c) => c.id === popover.id) ?? null)
    : null;
  const selectedIsCustomCapability = popover
    ? isCustomCapabilityId(doc.capabilityMap, popover.id)
    : false;

  const renderCard = (cat: (typeof solutionCategories)[number]) => {
    const enabled = isCategoryEnabled(categoryEnabled, cat.id);
    const capabilities = getEffectiveCapabilitiesForCategory(doc.capabilityMap, cat.id);
    const isCustom = isCustomCategoryId(doc.capabilityMap, cat.id);
    // Adoption excludes custom items: empty for custom categories,
    // seed-only for seed categories with custom extras.
    const adoptionCapabilityIds = isCustom
      ? []
      : (groupedSeed.capabilitiesByCategory.get(cat.id) ?? []).map((c) => c.id);
    const Card = dndMounted ? SortableCategoryCard : CategoryCard;
    const isLeaving = leavingIds.has(cat.id);
    return (
      <Card
        key={cat.id}
        category={cat}
        capabilities={capabilities}
        adoptionCapabilityIds={adoptionCapabilityIds}
        enabled={enabled}
        isCustomCategory={isCustom}
        isLeaving={isLeaving}
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        capabilityStatus={capabilityStatus}
        capabilityNotes={capabilityNotes}
        selectedCapabilityId={popover?.id ?? null}
        onToggle={(next) => handleCategoryToggle(cat.id, cat.name, next)}
        onPillClick={handlePillClick}
        onBulkSetStatus={(ids, status) => setCategoryCapabilityStatuses(ids, status)}
        onBulkClearNotes={(ids) => clearCategoryCapabilityNotes(ids)}
        onRenameCategory={isCustom ? renameCustomCategory : undefined}
        onDeleteCategory={isCustom ? deleteCustomCategory : undefined}
        onAddCapability={(categoryId, name) => addCapabilityToCategory(categoryId, name)}
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
        licensedCount={adoption.licensed}
        adoptedCount={adoption.adopted}
        onExport={handleExport}
        exportBusyFormat={exportBusyFormat}
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
                    <AddCategoryTile onAdd={(name) => addCustomCategory(name)} />
                  </div>
                </SortableContext>

                <AiNativeSection
                  searchTerm={searchTerm}
                  statusFilter={statusFilter}
                  capabilityStatus={capabilityStatus}
                  capabilityNotes={capabilityNotes}
                  selectedCapabilityId={popover?.id ?? null}
                  onPillClick={handlePillClick}
                />

                {inactiveCategories.length > 0 && (
                  <>
                    <div className="mt-6 mb-2 flex items-center gap-2 border-b border-border pb-1.5">
                      <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                        Inactive
                      </h2>
                      <span className="text-xs text-fg-subtle">({inactiveCategories.length})</span>
                    </div>
                    <SortableContext items={inactiveIds} strategy={rectSortingStrategy}>
                      <div className="grid gap-3" style={GRID_STYLE}>
                        {inactiveCategories.map(renderCard)}
                      </div>
                    </SortableContext>
                  </>
                )}
              </DndContext>
            ) : (
              <>
                <div className="grid gap-3" style={GRID_STYLE}>
                  {activeCategories.map(renderCard)}
                  <AddCategoryTile onAdd={(name) => addCustomCategory(name)} />
                </div>

                <AiNativeSection
                  searchTerm={searchTerm}
                  statusFilter={statusFilter}
                  capabilityStatus={capabilityStatus}
                  capabilityNotes={capabilityNotes}
                  selectedCapabilityId={popover?.id ?? null}
                  onPillClick={handlePillClick}
                />

                {inactiveCategories.length > 0 && (
                  <>
                    <div className="mt-6 mb-2 flex items-center gap-2 border-b border-border pb-1.5">
                      <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                        Inactive
                      </h2>
                      <span className="text-xs text-fg-subtle">({inactiveCategories.length})</span>
                    </div>
                    <div className="grid gap-3" style={GRID_STYLE}>
                      {inactiveCategories.map(renderCard)}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {popover && selectedCapability && (
        <StatusPopover
          anchor={popover.anchor}
          capabilityName={selectedCapability.name}
          status={getCapabilityStatus(capabilityStatus, popover.id)}
          notes={capabilityNotes[popover.id] ?? ''}
          isCustomCapability={selectedIsCustomCapability}
          onStatusChange={(next) => setCapabilityStatus(popover.id, next)}
          onNotesChange={(next) => setCapabilityNotes(popover.id, next)}
          onRename={
            selectedIsCustomCapability ? (name) => renameCapability(popover.id, name) : undefined
          }
          onDelete={selectedIsCustomCapability ? () => deleteCapability(popover.id) : undefined}
          onClose={closePopover}
        />
      )}

      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2"
      >
        <div
          role="status"
          className={`rounded border border-border bg-bg-overlay px-3 py-1.5 text-xs text-fg shadow-md transition-all duration-150 ${
            toast ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0'
          }`}
        >
          {toast ?? ' '}
        </div>
      </div>
    </div>
  );
}
