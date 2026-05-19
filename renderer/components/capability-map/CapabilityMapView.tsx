'use client';

import { useCallback, useMemo, useState } from 'react';
import { emptyDocument } from '../../../shared/file-format';
import type { CapabilityStatus } from '../../../shared/file-format';
import { useDocumentStore } from '../../state/document';
import { groupedSeed, isCategoryEnabled, seed } from '../../lib/capability-map';
import { countCapabilitiesByStatus, getCapabilityStatus } from '../../lib/capability-status';
import { AiNativeSection } from './AiNativeSection';
import { CategoryCard } from './CategoryCard';
import { HeaderStrip } from './HeaderStrip';
import { StatusPopover } from './StatusPopover';

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
    setPopover((prev) => (prev?.id === capabilityId ? null : { id: capabilityId, anchor }));
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
    ? (seed.capabilities.find((c) => c.id === popover.id) ?? null)
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
