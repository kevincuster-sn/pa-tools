'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdoptionRoadmap } from '../../../shared/file-format';
import { useDocumentStore } from '../../state/document';
import { emptyDocument } from '../../../shared/file-format';
import { buildCapabilityGroups } from '../../lib/adoption-roadmap';
import { getCapabilityStatus, STATUS_META } from '../../lib/capability-status';

interface Props {
  roadmap: AdoptionRoadmap;
  initialColumnId?: string;
  onClose: () => void;
}

export function AddCapabilitiesDialog({ roadmap, initialColumnId, onClose }: Props) {
  const currentDocument = useDocumentStore((s) => s.currentDocument);
  const addCapabilitiesToRoadmap = useDocumentStore((s) => s.addCapabilitiesToRoadmap);

  const doc = currentDocument ?? emptyDocument();
  const capMap = doc.capabilityMap;

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetColumnId, setTargetColumnId] = useState<string>(
    initialColumnId ?? roadmap.columns[0]?.id ?? '',
  );
  const [targetSwimlaneId, setTargetSwimlaneId] = useState<string | null>(
    roadmap.swimlanes[0]?.id ?? null,
  );

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Already-on-board capability ids.
  const onBoardIds = useMemo(
    () => new Set(roadmap.cards.map((c) => c.capabilityId)),
    [roadmap.cards],
  );

  const groups = useMemo(() => buildCapabilityGroups(capMap), [capMap]);

  const searchTerm = search.trim().toLowerCase();

  const filteredGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          capabilities: g.capabilities.filter(
            (cap) =>
              !searchTerm ||
              cap.name.toLowerCase().includes(searchTerm) ||
              g.categoryName.toLowerCase().includes(searchTerm),
          ),
        }))
        .filter((g) => g.capabilities.length > 0),
    [groups, searchTerm],
  );

  function toggleCapability(capId: string) {
    if (onBoardIds.has(capId)) return; // already on board, not selectable
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(capId)) next.delete(capId);
      else next.add(capId);
      return next;
    });
  }

  function handleToggleGroup(groupCapIds: string[]) {
    const selectableIds = groupCapIds.filter((id) => !onBoardIds.has(id));
    const allSelected = selectableIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        selectableIds.forEach((id) => next.delete(id));
      } else {
        selectableIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function handleAdd() {
    if (selected.size === 0) return;
    addCapabilitiesToRoadmap(roadmap.id, Array.from(selected), targetColumnId, targetSwimlaneId);
    onClose();
  }

  const selectedCount = selected.size;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden="true" />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add capabilities to roadmap"
        className="fixed inset-x-4 bottom-0 top-0 z-50 mx-auto flex max-w-2xl flex-col overflow-hidden rounded-t-lg border border-border bg-bg shadow-xl sm:inset-x-auto sm:inset-y-auto sm:top-20 sm:rounded-lg sm:pb-0"
        style={{ maxHeight: 'calc(100vh - 80px)' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="flex-1 text-sm font-semibold text-fg">Add capabilities to roadmap</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-fg-subtle hover:bg-bg-sunken hover:text-fg"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 border-b border-border px-4 py-2">
          <div className="flex items-center gap-2 rounded-sm border border-border bg-bg-elevated px-2">
            <Search size={13} className="shrink-0 text-fg-subtle" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search capabilities or categories…"
              className="flex-1 bg-transparent py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-fg-subtle hover:text-fg"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Capability list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredGroups.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-fg-subtle">
              No capabilities match your search.
            </div>
          ) : (
            filteredGroups.map((group) => {
              const selectableIds = group.capabilities
                .map((c) => c.id)
                .filter((id) => !onBoardIds.has(id));
              const allGroupSelected =
                selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
              const someGroupSelected = selectableIds.some((id) => selected.has(id));

              return (
                <div key={group.categoryId} className="border-b border-border last:border-b-0">
                  {/* Category header */}
                  <button
                    type="button"
                    onClick={() => handleToggleGroup(group.capabilities.map((c) => c.id))}
                    disabled={selectableIds.length === 0}
                    className="flex w-full items-center gap-2 bg-bg-elevated px-4 py-2 text-left disabled:cursor-default"
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={allGroupSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someGroupSelected && !allGroupSelected;
                      }}
                      className="h-3.5 w-3.5 cursor-pointer rounded-sm accent-accent"
                      tabIndex={-1}
                    />
                    <span className="text-xs font-medium text-fg">{group.categoryName}</span>
                    <span className="ml-auto text-xs text-fg-subtle">
                      {group.capabilities.length} capabilities
                    </span>
                  </button>
                  {/* Capabilities */}
                  {group.capabilities.map((cap) => {
                    const isOnBoard = onBoardIds.has(cap.id);
                    const isSelected = selected.has(cap.id);
                    const status = getCapabilityStatus(capMap.capabilityStatus, cap.id);
                    const statusMeta = STATUS_META[status];

                    return (
                      <label
                        key={cap.id}
                        className={[
                          'flex cursor-pointer items-center gap-2.5 px-4 py-1.5 text-xs',
                          isOnBoard ? 'cursor-default opacity-40' : 'hover:bg-bg-sunken',
                          isSelected ? 'bg-bg-sunken' : '',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected || isOnBoard}
                          disabled={isOnBoard}
                          onChange={() => toggleCapability(cap.id)}
                          className="h-3.5 w-3.5 cursor-pointer rounded-sm accent-accent disabled:cursor-default"
                        />
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: statusMeta.color }}
                        />
                        <span className="flex-1 truncate text-fg">{cap.name}</span>
                        <span className="shrink-0 text-fg-subtle">{statusMeta.label}</span>
                        {isOnBoard && (
                          <span className="shrink-0 rounded-sm bg-bg-sunken px-1 py-0.5 text-xs text-fg-subtle">
                            On board
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer — target selection + submit */}
        <div className="shrink-0 border-t border-border bg-bg-elevated px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Column selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-fg-subtle">Add to column</span>
              <select
                value={targetColumnId}
                onChange={(e) => setTargetColumnId(e.target.value)}
                className="h-6 rounded-sm border border-border bg-bg px-1.5 text-xs text-fg focus:border-accent focus:outline-none"
              >
                {roadmap.columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Swimlane selector (only when swimlanes exist) */}
            {roadmap.swimlanes.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-fg-subtle">swimlane</span>
                <select
                  value={targetSwimlaneId ?? ''}
                  onChange={(e) => setTargetSwimlaneId(e.target.value || null)}
                  className="h-6 rounded-sm border border-border bg-bg px-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                >
                  {roadmap.swimlanes.map((lane) => (
                    <option key={lane.id} value={lane.id}>
                      {lane.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-7 rounded-sm border border-border px-3 text-xs text-fg-muted hover:bg-bg-sunken"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={selectedCount === 0}
                className="h-7 rounded-sm border border-accent bg-accent px-3 text-xs font-medium text-accent-fg disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90"
              >
                Add {selectedCount > 0 ? selectedCount : ''} capabilit
                {selectedCount !== 1 ? 'ies' : 'y'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
