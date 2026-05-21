'use client';

import { memo, useMemo, type CSSProperties, type ReactNode, type Ref } from 'react';
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
  enabled: boolean;
  searchTerm: string;
  statusFilter: ReadonlySet<CapabilityStatus>;
  capabilityStatus: Record<string, CapabilityStatus>;
  capabilityNotes: Record<string, string>;
  selectedCapabilityId: string | null;
  onToggle: (next: boolean) => void;
  onPillClick: (capabilityId: string, anchor: HTMLElement) => void;
  onBulkSetStatus: (capabilityIds: string[], status: CapabilityStatus) => void;
  onBulkClearNotes: (capabilityIds: string[]) => void;
  containerRef?: Ref<HTMLElement>;
  containerStyle?: CSSProperties;
  isDragging?: boolean;
  isLeaving?: boolean;
  dragHandle?: ReactNode;
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
  onBulkSetStatus,
  onBulkClearNotes,
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
    () =>
      computeAdoption(
        capabilities.map((c) => c.id),
        capabilityStatus,
      ),
    [capabilities, capabilityStatus],
  );
  const adoptionBelowThreshold = adoption.licensed > 0 && adoption.pct < ADOPTION_THRESHOLD_PCT;

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
        <div className="flex min-w-0 items-center gap-1.5">
          {dragHandle}
          <h3
            className="truncate text-sm font-medium text-fg"
            title={category.fullName ?? category.name}
          >
            {category.name}
          </h3>
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
      </div>
    </section>
  );
}

export const CategoryCard = memo(CategoryCardImpl);
