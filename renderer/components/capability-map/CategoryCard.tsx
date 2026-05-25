'use client';

import { Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import type { Capability, Category } from '../../data/types';
import type { CapabilityStatus } from '../../../shared/file-format';
import { matchesSearch } from '../../lib/capability-map';
import {
  ADOPTION_THRESHOLD_PCT,
  computeAdoption,
  getCapabilityStatus,
} from '../../lib/capability-status';
import { CapabilityPill } from './CapabilityPill';
import { CategoryBulkMenu } from './CategoryBulkMenu';
import { ToggleSwitch } from './ToggleSwitch';

export interface CategoryCardProps {
  category: Category;
  capabilities: Capability[];
  // Capability ids that count toward this category's adoption %.
  // Custom capabilities are excluded from adoption — pass only seed ids here.
  // Custom categories should pass [] to suppress the adoption badge entirely.
  adoptionCapabilityIds: readonly string[];
  enabled: boolean;
  isCustomCategory: boolean;
  searchTerm: string;
  statusFilter: ReadonlySet<CapabilityStatus>;
  capabilityStatus: Record<string, CapabilityStatus>;
  capabilityNotes: Record<string, string>;
  selectedCapabilityId: string | null;
  onToggle: (next: boolean) => void;
  onPillClick: (capabilityId: string, anchor: HTMLElement) => void;
  onBulkSetStatus: (capabilityIds: string[], status: CapabilityStatus) => void;
  onBulkClearNotes: (capabilityIds: string[]) => void;
  onRenameCategory?: (categoryId: string, name: string) => void;
  onDeleteCategory?: (categoryId: string) => void;
  onAddCapability?: (categoryId: string, name: string) => void;
  containerRef?: Ref<HTMLElement>;
  containerStyle?: CSSProperties;
  isDragging?: boolean;
  isLeaving?: boolean;
  dragHandle?: ReactNode;
}

function CategoryCardImpl({
  category,
  capabilities,
  adoptionCapabilityIds,
  enabled,
  isCustomCategory,
  searchTerm,
  statusFilter,
  capabilityStatus,
  capabilityNotes,
  selectedCapabilityId,
  onToggle,
  onPillClick,
  onBulkSetStatus,
  onBulkClearNotes,
  onRenameCategory,
  onDeleteCategory,
  onAddCapability,
  containerRef,
  containerStyle,
  isDragging,
  isLeaving,
  dragHandle,
}: CategoryCardProps) {
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
    (searchTerm || statusFilter.size > 0) &&
    visibleCapabilities.length === 0 &&
    capabilities.length > 0;

  const adoption = useMemo(
    () => computeAdoption(adoptionCapabilityIds, capabilityStatus),
    [adoptionCapabilityIds, capabilityStatus],
  );
  const adoptionBelowThreshold = adoption.licensed > 0 && adoption.pct < ADOPTION_THRESHOLD_PCT;

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(category.name);
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  function startRename() {
    setNameDraft(category.name);
    setEditingName(true);
  }

  function commitRename() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== category.name) onRenameCategory?.(category.id, trimmed);
    setEditingName(false);
  }

  function cancelRename() {
    setEditingName(false);
  }

  function handleDelete() {
    const ok = window.confirm(
      `Delete custom category "${category.name}" and all its capabilities? This cannot be undone.`,
    );
    if (ok) onDeleteCategory?.(category.id);
  }

  const [addingCap, setAddingCap] = useState(false);
  const [capDraft, setCapDraft] = useState('');
  const capInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (addingCap) capInputRef.current?.focus();
  }, [addingCap]);

  function commitAddCap() {
    const trimmed = capDraft.trim();
    if (trimmed) onAddCapability?.(category.id, trimmed);
    setCapDraft('');
    setAddingCap(false);
  }

  function cancelAddCap() {
    setCapDraft('');
    setAddingCap(false);
  }

  return (
    <section
      ref={containerRef}
      style={isLeaving ? { ...containerStyle, opacity: 0 } : containerStyle}
      className={[
        'flex h-full flex-col rounded border border-border bg-bg-elevated transition-opacity duration-200',
        enabled || isLeaving ? '' : 'opacity-40',
        isDragging ? 'shadow-lg ring-1 ring-accent' : '',
      ].join(' ')}
      aria-label={category.fullName ?? category.name}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {dragHandle}
          {editingName ? (
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                else if (e.key === 'Escape') cancelRename();
              }}
              aria-label={`Rename ${category.name}`}
              className="h-6 min-w-0 flex-1 rounded-sm border border-accent bg-bg px-1.5 text-sm font-medium text-fg focus:outline-none"
            />
          ) : (
            <h3
              className={[
                'truncate text-sm font-medium text-fg',
                isCustomCategory ? 'cursor-text' : '',
              ].join(' ')}
              title={category.fullName ?? category.name}
              onDoubleClick={() => {
                if (isCustomCategory) startRename();
              }}
            >
              {category.name}
            </h3>
          )}
          {isCustomCategory && !editingName && onRenameCategory && (
            <button
              type="button"
              onClick={startRename}
              aria-label={`Rename ${category.name}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-bg-sunken hover:text-fg focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <Pencil size={11} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {adoption.licensed > 0 && (
            <span
              className={[
                'text-xs font-medium tabular-nums',
                adoptionBelowThreshold ? 'text-red-600 dark:text-red-400' : 'text-fg-muted',
              ].join(' ')}
              title={`${adoption.adopted} of ${adoption.licensed} licensed in use`}
              aria-label={`Adoption ${adoption.pct}%, ${adoption.adopted} of ${adoption.licensed} licensed`}
            >
              {adoption.pct}%
            </span>
          )}
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
          {isCustomCategory && onDeleteCategory && (
            <button
              type="button"
              onClick={handleDelete}
              aria-label={`Delete ${category.name}`}
              className="flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted hover:bg-bg-sunken hover:text-red-600 focus:outline-none focus:ring-1 focus:ring-accent dark:hover:text-red-400"
            >
              <Trash2 size={12} aria-hidden="true" />
            </button>
          )}
          <ToggleSwitch checked={enabled} onChange={onToggle} label={`Enable ${category.name}`} />
        </div>
      </header>
      <div
        role="list"
        aria-label={`${category.name} capabilities`}
        className="flex flex-col gap-1 p-2"
      >
        {capabilities.length === 0 && !addingCap && (
          <div className="px-1 py-0.5 text-xs italic text-fg-subtle">No capabilities</div>
        )}
        {filteredOut && (
          <div className="px-1 py-0.5 text-xs italic text-fg-subtle">
            No matches in this category
          </div>
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
        {onAddCapability && (
          <>
            {addingCap ? (
              <div className="flex items-center gap-1.5 pt-0.5">
                <input
                  ref={capInputRef}
                  value={capDraft}
                  onChange={(e) => setCapDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitAddCap();
                    else if (e.key === 'Escape') cancelAddCap();
                  }}
                  placeholder="Capability name"
                  aria-label="New capability name"
                  className="h-7 min-w-0 flex-1 rounded-sm border border-accent bg-bg px-2 text-xs text-fg placeholder:text-fg-subtle focus:outline-none"
                />
                <button
                  type="button"
                  onClick={cancelAddCap}
                  aria-label="Cancel"
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-fg-muted hover:bg-bg-sunken hover:text-fg"
                >
                  <X size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={commitAddCap}
                  disabled={!capDraft.trim()}
                  className="h-7 rounded-sm bg-accent px-2 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingCap(true)}
                disabled={!enabled}
                className="flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-fg-muted hover:bg-bg-sunken hover:text-fg focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
              >
                <Plus size={12} aria-hidden="true" />
                <span>Add capability</span>
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export const CategoryCard = memo(CategoryCardImpl);
