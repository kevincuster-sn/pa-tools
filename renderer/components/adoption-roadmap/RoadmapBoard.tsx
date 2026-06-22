'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdoptionRoadmap, RoadmapCard as RoadmapCardData } from '../../../shared/file-format';
import { useDocumentStore } from '../../state/document';
import { buildCapabilityLookup, type CapabilityInfo } from '../../lib/adoption-roadmap';
import { emptyDocument } from '../../../shared/file-format';
import { AddCapabilitiesDialog } from './AddCapabilitiesDialog';
import { RoadmapCard } from './RoadmapCard';

interface Props {
  roadmap: AdoptionRoadmap;
}

// ---- helpers ----------------------------------------------------------------

function cellKey(columnId: string, swimlaneId: string | null): string {
  return `cell:${columnId}:${swimlaneId ?? 'none'}`;
}

function parseCellKey(key: string): [string, string | null] {
  // "cell:<columnId>:<swimlaneId|none>"
  const rest = key.slice(5); // strip "cell:"
  const colonIdx = rest.indexOf(':');
  const columnId = rest.slice(0, colonIdx);
  const rawLane = rest.slice(colonIdx + 1);
  return [columnId, rawLane === 'none' ? null : rawLane];
}

function isCardId(id: UniqueIdentifier): boolean {
  return String(id).startsWith('rm-card-');
}

function isColumnId(id: UniqueIdentifier): boolean {
  return String(id).startsWith('rm-col-');
}

// ---- main board component ---------------------------------------------------

export function RoadmapBoard({ roadmap }: Props) {
  const currentDocument = useDocumentStore((s) => s.currentDocument);
  const setRoadmapColumnOrder = useDocumentStore((s) => s.setRoadmapColumnOrder);
  const addRoadmapColumn = useDocumentStore((s) => s.addRoadmapColumn);
  const renameRoadmapColumn = useDocumentStore((s) => s.renameRoadmapColumn);
  const deleteRoadmapColumn = useDocumentStore((s) => s.deleteRoadmapColumn);
  const addRoadmapSwimlane = useDocumentStore((s) => s.addRoadmapSwimlane);
  const renameRoadmapSwimlane = useDocumentStore((s) => s.renameRoadmapSwimlane);
  const deleteRoadmapSwimlane = useDocumentStore((s) => s.deleteRoadmapSwimlane);
  const setRoadmapSwimlaneOrder = useDocumentStore((s) => s.setRoadmapSwimlaneOrder);
  const moveRoadmapCard = useDocumentStore((s) => s.moveRoadmapCard);

  const doc = currentDocument ?? emptyDocument();
  const capabilityLookup = useMemo(
    () => buildCapabilityLookup(doc.capabilityMap),
    [doc.capabilityMap],
  );

  // dnd-kit aria id SSR guard.
  const [dndMounted, setDndMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDndMounted(true), []);

  // Active drag item id.
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  // Live cards state for cross-cell visual preview.
  const [liveCards, setLiveCards] = useState<RoadmapCardData[] | null>(null);
  // Only use optimistic liveCards while a drag is in progress.
  const effectiveCards = activeId && liveCards ? liveCards : roadmap.cards;

  // Dialog state: which column id triggered the add-capabilities dialog.
  const [addForColumnId, setAddForColumnId] = useState<string | null>(null);

  // Inline rename state for columns.
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnDraft, setEditingColumnDraft] = useState('');

  // Inline rename state for swimlanes.
  const [editingSwimlaneId, setEditingSwimlaneId] = useState<string | null>(null);
  const [editingSwimlaneDraft, setEditingSwimlaneDraft] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ---- DnD handlers --------------------------------------------------------

  const handleDragStart = useCallback(
    ({ active }: DragStartEvent) => {
      setActiveId(active.id);
      setLiveCards(roadmap.cards);
    },
    [roadmap.cards],
  );

  const handleDragOver = useCallback(
    ({ active, over }: DragOverEvent) => {
      if (!over || !isCardId(active.id)) return;

      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);

      setLiveCards((prev) => {
        const cards = prev ?? roadmap.cards;
        const activeCard = cards.find((c) => c.id === activeIdStr);
        if (!activeCard) return prev;

        // Determine destination cell.
        let destColumnId: string;
        let destSwimlaneId: string | null;

        if (overIdStr.startsWith('cell:')) {
          [destColumnId, destSwimlaneId] = parseCellKey(overIdStr);
        } else if (isCardId(overIdStr)) {
          const overCard = cards.find((c) => c.id === overIdStr);
          if (!overCard) return prev;
          destColumnId = overCard.columnId;
          destSwimlaneId = overCard.swimlaneId;
        } else {
          return prev;
        }

        const activeCellKey = cellKey(activeCard.columnId, activeCard.swimlaneId);
        const destCellKey = cellKey(destColumnId, destSwimlaneId);

        if (activeCellKey === destCellKey) return prev; // same cell, handled by SortableContext

        // Move the card to the new cell.
        const updatedCard: RoadmapCardData = {
          ...activeCard,
          columnId: destColumnId,
          swimlaneId: destSwimlaneId,
        };
        const withoutActive = cards.filter((c) => c.id !== activeIdStr);

        if (isCardId(overIdStr)) {
          const overIdx = withoutActive.findIndex((c) => c.id === overIdStr);
          if (overIdx >= 0) {
            return [
              ...withoutActive.slice(0, overIdx),
              updatedCard,
              ...withoutActive.slice(overIdx),
            ];
          }
        }

        return [...withoutActive, updatedCard];
      });
    },
    [roadmap.cards],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveId(null);

      if (!over) {
        setLiveCards(null);
        return;
      }

      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);

      // ---- Column reorder ----
      if (isColumnId(active.id)) {
        const fromIdx = roadmap.columns.findIndex((c) => c.id === activeIdStr);
        const toIdx = roadmap.columns.findIndex((c) => c.id === overIdStr);
        if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
          setRoadmapColumnOrder(
            roadmap.id,
            arrayMove(roadmap.columns, fromIdx, toIdx).map((c) => c.id),
          );
        }
        setLiveCards(null);
        return;
      }

      // ---- Card move ----
      if (isCardId(active.id)) {
        const finalCards = liveCards ?? roadmap.cards;
        const activeCard = finalCards.find((c) => c.id === activeIdStr);
        if (!activeCard) {
          setLiveCards(null);
          return;
        }

        // Compute index within destination cell.
        const cellCards = finalCards.filter(
          (c) =>
            c.columnId === activeCard.columnId &&
            c.swimlaneId === activeCard.swimlaneId &&
            c.id !== activeIdStr,
        );
        // Find where the active card sits among the live cards in that cell.
        const liveCellCards = finalCards.filter(
          (c) => c.columnId === activeCard.columnId && c.swimlaneId === activeCard.swimlaneId,
        );
        const indexInCell = liveCellCards.findIndex((c) => c.id === activeIdStr);

        moveRoadmapCard(
          roadmap.id,
          activeIdStr,
          activeCard.columnId,
          activeCard.swimlaneId,
          indexInCell >= 0 ? indexInCell : cellCards.length,
        );
        setLiveCards(null);
      }
    },
    [roadmap, liveCards, setRoadmapColumnOrder, moveRoadmapCard],
  );

  // ---- Column management ---------------------------------------------------

  function handleAddColumn() {
    const id = addRoadmapColumn(roadmap.id, 'New Column');
    if (id) {
      setEditingColumnId(id);
      setEditingColumnDraft('New Column');
    }
  }

  function handleRenameColumn(columnId: string, currentTitle: string) {
    setEditingColumnId(columnId);
    setEditingColumnDraft(currentTitle);
  }

  function commitColumnRename() {
    if (!editingColumnId) return;
    const trimmed = editingColumnDraft.trim();
    if (trimmed) renameRoadmapColumn(roadmap.id, editingColumnId, trimmed);
    setEditingColumnId(null);
    setEditingColumnDraft('');
  }

  function cancelColumnRename() {
    setEditingColumnId(null);
    setEditingColumnDraft('');
  }

  function handleDeleteColumn(columnId: string, title: string) {
    const ok = window.confirm(
      `Delete column "${title}"? All cards in this column will be removed.`,
    );
    if (!ok) return;
    deleteRoadmapColumn(roadmap.id, columnId);
  }

  // ---- Swimlane management -------------------------------------------------

  function handleAddSwimlane() {
    const id = addRoadmapSwimlane(roadmap.id, 'New Swimlane');
    if (id) {
      setEditingSwimlaneId(id);
      setEditingSwimlaneDraft('New Swimlane');
    }
  }

  function handleRenameSwimlane(swimlaneId: string, currentTitle: string) {
    setEditingSwimlaneId(swimlaneId);
    setEditingSwimlaneDraft(currentTitle);
  }

  function commitSwimlaneRename() {
    if (!editingSwimlaneId) return;
    const trimmed = editingSwimlaneDraft.trim();
    if (trimmed) renameRoadmapSwimlane(roadmap.id, editingSwimlaneId, trimmed);
    setEditingSwimlaneId(null);
    setEditingSwimlaneDraft('');
  }

  function cancelSwimlaneRename() {
    setEditingSwimlaneId(null);
    setEditingSwimlaneDraft('');
  }

  function handleDeleteSwimlane(swimlaneId: string, title: string) {
    const ok = window.confirm(
      `Delete swimlane "${title}"? Cards in this swimlane will move to the first remaining swimlane.`,
    );
    if (!ok) return;
    deleteRoadmapSwimlane(roadmap.id, swimlaneId);
  }

  function handleMoveSwimlaneUp(swimlaneId: string) {
    const idx = roadmap.swimlanes.findIndex((l) => l.id === swimlaneId);
    if (idx <= 0) return;
    const next = [...roadmap.swimlanes];
    const tmp = next[idx - 1]!;
    next[idx - 1] = next[idx]!;
    next[idx] = tmp;
    setRoadmapSwimlaneOrder(
      roadmap.id,
      next.map((l) => l.id),
    );
  }

  function handleMoveSwimlaneDown(swimlaneId: string) {
    const idx = roadmap.swimlanes.findIndex((l) => l.id === swimlaneId);
    if (idx < 0 || idx >= roadmap.swimlanes.length - 1) return;
    const next = [...roadmap.swimlanes];
    const tmp = next[idx + 1]!;
    next[idx + 1] = next[idx]!;
    next[idx] = tmp;
    setRoadmapSwimlaneOrder(
      roadmap.id,
      next.map((l) => l.id),
    );
  }

  // ---- Compute card id list per cell (for SortableContext) -----------------

  function cardsInCell(columnId: string, swimlaneId: string | null): RoadmapCardData[] {
    return effectiveCards.filter((c) => c.columnId === columnId && c.swimlaneId === swimlaneId);
  }

  const hasSwimlanes = roadmap.swimlanes.length > 0;
  const columnIds = roadmap.columns.map((c) => c.id);

  // Dragged item for overlay.
  const activeCard = activeId ? effectiveCards.find((c) => c.id === activeId) : null;

  if (!dndMounted) return null;

  const LANE_LABEL_W = 160;
  const COL_MIN_W = 240;
  const gridCols = hasSwimlanes
    ? `${LANE_LABEL_W}px repeat(${roadmap.columns.length}, minmax(${COL_MIN_W}px, 1fr))`
    : `repeat(${roadmap.columns.length}, minmax(${COL_MIN_W}px, 1fr))`;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full flex-col overflow-auto">
        {/* ---- Column headers ---- */}
        <div
          className="sticky top-0 z-10 flex shrink-0 border-b border-border bg-bg-elevated"
          style={{ display: 'grid', gridTemplateColumns: gridCols }}
        >
          {hasSwimlanes && (
            <div className="flex items-center border-r border-border px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                Swimlanes
              </span>
            </div>
          )}
          <SortableContext items={columnIds}>
            {roadmap.columns.map((col) => (
              <SortableColumnHeader
                key={col.id}
                column={col}
                isEditing={editingColumnId === col.id}
                editDraft={editingColumnDraft}
                onEditDraftChange={setEditingColumnDraft}
                onEditCommit={commitColumnRename}
                onEditCancel={cancelColumnRename}
                onAddCapabilities={() => setAddForColumnId(col.id)}
                onRename={() => handleRenameColumn(col.id, col.title)}
                onDelete={() => handleDeleteColumn(col.id, col.title)}
              />
            ))}
          </SortableContext>
          <button
            type="button"
            onClick={handleAddColumn}
            title="Add column"
            className="flex items-center justify-center border-l border-border px-3 py-2 text-fg-subtle hover:bg-bg-sunken hover:text-fg"
            style={{ width: 40 }}
          >
            <Plus size={13} />
          </button>
        </div>

        {/* ---- Board body ---- */}
        <div className="flex-1">
          {hasSwimlanes ? (
            <>
              {roadmap.swimlanes.map((lane, laneIdx) => {
                const isAlt = laneIdx % 2 === 1;
                return (
                  <div
                    key={lane.id}
                    className="border-b border-border"
                    style={{ display: 'grid', gridTemplateColumns: gridCols }}
                  >
                    {/* Swimlane label */}
                    <div
                      className={[
                        'flex min-h-[120px] items-start gap-1 border-r border-border p-2',
                        isAlt ? 'bg-bg-sunken' : 'bg-bg-elevated',
                      ].join(' ')}
                    >
                      <div className="flex flex-1 flex-col gap-1">
                        {editingSwimlaneId === lane.id ? (
                          <input
                            autoFocus
                            value={editingSwimlaneDraft}
                            onChange={(e) => setEditingSwimlaneDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitSwimlaneRename();
                              else if (e.key === 'Escape') cancelSwimlaneRename();
                            }}
                            onBlur={commitSwimlaneRename}
                            className="h-5 w-full rounded-sm border border-accent bg-bg px-1 text-xs text-fg focus:outline-none"
                            aria-label="Swimlane name"
                          />
                        ) : (
                          <span className="text-xs font-medium text-fg">{lane.title}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleMoveSwimlaneUp(lane.id)}
                          disabled={laneIdx === 0}
                          className="flex h-5 w-5 items-center justify-center rounded-sm text-fg-subtle hover:bg-bg-sunken hover:text-fg disabled:opacity-30"
                          title="Move up"
                        >
                          <ChevronUp size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSwimlaneDown(lane.id)}
                          disabled={laneIdx === roadmap.swimlanes.length - 1}
                          className="flex h-5 w-5 items-center justify-center rounded-sm text-fg-subtle hover:bg-bg-sunken hover:text-fg disabled:opacity-30"
                          title="Move down"
                        >
                          <ChevronDown size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRenameSwimlane(lane.id, lane.title)}
                          className="flex h-5 w-5 items-center justify-center rounded-sm text-fg-subtle hover:bg-bg-sunken hover:text-fg"
                          title="Rename swimlane"
                        >
                          <Pencil size={9} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSwimlane(lane.id, lane.title)}
                          className="flex h-5 w-5 items-center justify-center rounded-sm text-fg-subtle hover:bg-bg-sunken hover:text-red-600 dark:hover:text-red-400"
                          title="Delete swimlane"
                        >
                          <Trash2 size={9} />
                        </button>
                      </div>
                    </div>
                    {/* Cells */}
                    {roadmap.columns.map((col) => {
                      const cKey = cellKey(col.id, lane.id);
                      const cellCards = cardsInCell(col.id, lane.id);
                      return (
                        <CardCell
                          key={cKey}
                          cellId={cKey}
                          cards={cellCards}
                          roadmapId={roadmap.id}
                          capabilityLookup={capabilityLookup}
                          activeId={activeId}
                          isAlt={isAlt}
                        />
                      );
                    })}
                  </div>
                );
              })}
              {/* Add swimlane row */}
              <div
                className="border-b border-dashed border-border"
                style={{ display: 'grid', gridTemplateColumns: gridCols }}
              >
                <div className="flex items-center p-2">
                  <button
                    type="button"
                    onClick={handleAddSwimlane}
                    className="flex items-center gap-1 text-xs text-fg-subtle hover:text-fg"
                  >
                    <Plus size={12} />
                    Add swimlane
                  </button>
                </div>
                {roadmap.columns.map((col) => (
                  <div key={col.id} className="border-l border-border" />
                ))}
              </div>
            </>
          ) : (
            /* No swimlanes: single row of cells */
            <>
              <div style={{ display: 'grid', gridTemplateColumns: gridCols, minHeight: 200 }}>
                {roadmap.columns.map((col) => {
                  const cKey = cellKey(col.id, null);
                  const cellCards = cardsInCell(col.id, null);
                  return (
                    <CardCell
                      key={cKey}
                      cellId={cKey}
                      cards={cellCards}
                      roadmapId={roadmap.id}
                      capabilityLookup={capabilityLookup}
                      activeId={activeId}
                    />
                  );
                })}
              </div>
              <div className="flex items-center border-t border-dashed border-border p-2">
                <button
                  type="button"
                  onClick={handleAddSwimlane}
                  className="flex items-center gap-1 text-xs text-fg-subtle hover:text-fg"
                >
                  <Plus size={12} />
                  Add swimlanes
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---- Drag overlay ---- */}
      <DragOverlay>
        {activeCard ? (
          <div className="w-60 rotate-2 opacity-90">
            <RoadmapCard
              roadmapId={roadmap.id}
              card={activeCard}
              capabilityInfo={capabilityLookup.get(activeCard.capabilityId)}
            />
          </div>
        ) : null}
      </DragOverlay>

      {/* ---- Add capabilities dialog ---- */}
      {addForColumnId && (
        <AddCapabilitiesDialog
          roadmap={roadmap}
          initialColumnId={addForColumnId}
          onClose={() => setAddForColumnId(null)}
        />
      )}
    </DndContext>
  );
}

// ---- SortableColumnHeader --------------------------------------------------

interface ColumnHeaderProps {
  column: { id: string; title: string };
  isEditing: boolean;
  editDraft: string;
  onEditDraftChange: (v: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  onAddCapabilities: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function SortableColumnHeader({
  column,
  isEditing,
  editDraft,
  onEditDraftChange,
  onEditCommit,
  onEditCancel,
  onAddCapabilities,
  onRename,
  onDelete,
}: ColumnHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 border-l border-border px-3 py-2"
    >
      {!isEditing && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab text-fg-subtle hover:text-fg active:cursor-grabbing"
          title="Drag to reorder column"
        >
          <GripVertical size={12} />
        </button>
      )}
      {isEditing ? (
        <input
          autoFocus
          value={editDraft}
          onChange={(e) => onEditDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEditCommit();
            else if (e.key === 'Escape') onEditCancel();
          }}
          onBlur={onEditCommit}
          onClick={(e) => e.stopPropagation()}
          className="h-5 flex-1 rounded-sm border border-accent bg-bg px-1 text-xs text-fg focus:outline-none"
          aria-label="Column name"
        />
      ) : (
        <>
          <span className="flex-1 truncate text-xs font-medium text-fg">{column.title}</span>
          <button
            type="button"
            onClick={onAddCapabilities}
            className="ml-0.5 shrink-0 text-fg-subtle hover:text-fg"
            title="Add capabilities to this column"
          >
            <Plus size={10} />
          </button>
          <button
            type="button"
            onClick={onRename}
            className="ml-0.5 shrink-0 text-fg-subtle hover:text-fg"
            title="Rename column"
          >
            <Pencil size={10} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="ml-0.5 shrink-0 text-fg-subtle hover:text-red-600 dark:hover:text-red-400"
            title="Delete column"
          >
            <Trash2 size={10} />
          </button>
        </>
      )}
    </div>
  );
}

// ---- CardCell (droppable + sortable cards) ----------------------------------

interface CardCellProps {
  cellId: string;
  cards: RoadmapCardData[];
  roadmapId: string;
  capabilityLookup: Map<string, CapabilityInfo>;
  activeId: UniqueIdentifier | null;
  isAlt?: boolean;
}

function CardCell({ cellId, cards, roadmapId, capabilityLookup, activeId, isAlt }: CardCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId });
  const cardIds = cards.map((c) => c.id);

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex min-h-[120px] flex-col gap-1.5 border-l border-border p-2',
        isOver ? 'bg-bg-sunken' : isAlt ? 'bg-bg-elevated' : '',
      ].join(' ')}
    >
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        {cards.map((card) => (
          <SortableCard
            key={card.id}
            card={card}
            roadmapId={roadmapId}
            capabilityLookup={capabilityLookup}
            isActivelyDragging={card.id === activeId}
          />
        ))}
      </SortableContext>
    </div>
  );
}

// ---- SortableCard ----------------------------------------------------------

interface SortableCardProps {
  card: RoadmapCardData;
  roadmapId: string;
  capabilityLookup: Map<string, CapabilityInfo>;
  isActivelyDragging: boolean;
}

function SortableCard({
  card,
  roadmapId,
  capabilityLookup,
  isActivelyDragging,
}: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
      <RoadmapCard
        roadmapId={roadmapId}
        card={card}
        capabilityInfo={capabilityLookup.get(card.capabilityId)}
        isDragging={isDragging || isActivelyDragging}
      />
    </div>
  );
}
