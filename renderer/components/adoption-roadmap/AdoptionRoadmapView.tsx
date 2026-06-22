'use client';

import { ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyDocument } from '../../../shared/file-format';
import type { AdoptionRoadmap } from '../../../shared/file-format';
import { useDocumentStore } from '../../state/document';
import { exportRoadmap, type ExportFormat } from '../../lib/export';
import { ExportMenu } from '../capability-map/ExportMenu';
import { RoadmapBoard } from './RoadmapBoard';

export function AdoptionRoadmapView() {
  const currentDocument = useDocumentStore((s) => s.currentDocument);
  const addRoadmap = useDocumentStore((s) => s.addRoadmap);
  const renameRoadmap = useDocumentStore((s) => s.renameRoadmap);
  const deleteRoadmap = useDocumentStore((s) => s.deleteRoadmap);

  const doc = currentDocument ?? emptyDocument();
  const roadmaps = doc.adoptionRoadmaps;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exportBusyFormat, setExportBusyFormat] = useState<ExportFormat | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Inline creation state.
  const [isCreating, setIsCreating] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);

  // Derive the active selection during render — default to first roadmap when selection is invalid.
  const resolvedSelectedId =
    roadmaps.length === 0
      ? null
      : selectedId && roadmaps.find((r) => r.id === selectedId)
        ? selectedId
        : roadmaps[0]!.id;

  useEffect(() => {
    if (isCreating) createInputRef.current?.focus();
  }, [isCreating]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 1600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const activeRoadmap = resolvedSelectedId
    ? (roadmaps.find((r) => r.id === resolvedSelectedId) ?? null)
    : null;

  function startCreating() {
    setCreatingDraft('New Roadmap');
    setIsCreating(true);
  }

  function commitCreate() {
    const name = creatingDraft.trim();
    setIsCreating(false);
    setCreatingDraft('');
    if (!name) return;
    const id = addRoadmap(name);
    if (id) setSelectedId(id);
  }

  function cancelCreate() {
    setIsCreating(false);
    setCreatingDraft('');
  }

  function handleDeleteRoadmap(roadmap: AdoptionRoadmap) {
    const ok = window.confirm(`Delete roadmap "${roadmap.name}"? This cannot be undone.`);
    if (!ok) return;
    deleteRoadmap(roadmap.id);
  }

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!activeRoadmap || exportBusyFormat) return;
      setExportBusyFormat(format);
      try {
        const result = await exportRoadmap(doc, activeRoadmap.id, format);
        if (result.ok) setToast(`Exported ${format.toUpperCase()}`);
        else if (result.cancelled) {
          /* no toast */
        } else setToast(`Export failed: ${result.errorMessage ?? 'unknown error'}`);
      } catch (err) {
        setToast(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setExportBusyFormat(null);
      }
    },
    [doc, activeRoadmap, exportBusyFormat],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      {/* ---- top bar ---- */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-bg-elevated px-4 py-2">
        {/* Roadmap tab strip */}
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {roadmaps.map((rm) => (
            <RoadmapTab
              key={rm.id}
              roadmap={rm}
              active={rm.id === resolvedSelectedId}
              onSelect={() => setSelectedId(rm.id)}
              onRename={(name) => renameRoadmap(rm.id, name)}
              onDelete={() => handleDeleteRoadmap(rm)}
            />
          ))}

          {/* Inline create input */}
          {isCreating ? (
            <div className="flex items-center gap-1">
              <input
                ref={createInputRef}
                value={creatingDraft}
                onChange={(e) => setCreatingDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitCreate();
                  else if (e.key === 'Escape') cancelCreate();
                }}
                onBlur={commitCreate}
                className="h-7 w-40 rounded-sm border border-accent bg-bg px-2 text-xs text-fg focus:outline-none"
                aria-label="New roadmap name"
              />
              <button
                type="button"
                onClick={cancelCreate}
                className="flex h-5 w-5 items-center justify-center rounded-sm text-fg-subtle hover:text-fg"
              >
                <X size={11} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startCreating}
              title="New roadmap"
              className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-dashed border-border text-fg-subtle hover:border-border-strong hover:text-fg"
            >
              <Plus size={13} />
            </button>
          )}
        </div>

        {/* Actions */}
        {activeRoadmap && (
          <div className="ml-2 flex shrink-0 items-center gap-2">
            <ExportMenu
              busyFormat={exportBusyFormat}
              onExport={handleExport}
              disabled={!activeRoadmap}
            />
          </div>
        )}
      </div>

      {/* ---- board area ---- */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {!activeRoadmap ? (
          <EmptyState onCreateRoadmap={startCreating} />
        ) : (
          <RoadmapBoard roadmap={activeRoadmap} />
        )}
      </div>

      {/* ---- toast ---- */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2 rounded-sm border border-border bg-bg-overlay px-3 py-1.5 text-xs text-fg shadow-md"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ---- RoadmapTab ------------------------------------------------------------

interface TabProps {
  roadmap: AdoptionRoadmap;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function RoadmapTab({ roadmap, active, onSelect, onRename, onDelete }: TabProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function startRename() {
    setMenuOpen(false);
    setDraft(roadmap.name);
    setIsEditing(true);
  }

  function commitRename() {
    const trimmed = draft.trim();
    setIsEditing(false);
    if (trimmed && trimmed !== roadmap.name) onRename(trimmed);
  }

  function cancelRename() {
    setIsEditing(false);
  }

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-center">
      {isEditing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            else if (e.key === 'Escape') cancelRename();
          }}
          onBlur={commitRename}
          className="h-7 w-40 rounded-sm border border-accent bg-bg px-2 text-xs text-fg focus:outline-none"
          aria-label="Roadmap name"
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={active ? startRename : undefined}
          className={[
            'flex h-7 items-center gap-1 rounded-sm border px-2.5 text-xs',
            active
              ? 'border-accent bg-bg-sunken font-medium text-fg'
              : 'border-transparent text-fg-muted hover:border-border hover:text-fg',
          ].join(' ')}
        >
          {roadmap.name}
        </button>
      )}

      {active && !isEditing && (
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-5 w-5 items-center justify-center rounded-sm text-fg-subtle hover:bg-bg-sunken hover:text-fg"
          aria-label="Roadmap options"
        >
          <ChevronDown size={10} />
        </button>
      )}

      {menuOpen && (
        <div
          role="menu"
          className="absolute left-0 top-8 z-20 w-36 overflow-hidden rounded-sm border border-border bg-bg-overlay shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={startRename}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg hover:bg-bg-sunken"
          >
            <Pencil size={11} />
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left text-xs text-red-600 hover:bg-bg-sunken dark:text-red-400"
          >
            <Trash2 size={11} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ---- EmptyState ------------------------------------------------------------

function EmptyState({ onCreateRoadmap }: { onCreateRoadmap: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium text-fg">No adoption roadmaps yet</p>
        <p className="max-w-xs text-xs text-fg-subtle">
          Create a kanban-style board to plan adoption of ServiceNow capabilities over time.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreateRoadmap}
        className="flex h-8 items-center gap-1.5 rounded-sm border border-accent bg-accent px-3 text-xs font-medium text-accent-fg hover:opacity-90"
      >
        <Plus size={13} />
        Create roadmap
      </button>
    </div>
  );
}
