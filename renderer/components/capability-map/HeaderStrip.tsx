'use client';

import { Search } from 'lucide-react';
import type { CapabilityStatus } from '../../../shared/file-format';

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
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-bg-elevated px-4 py-2">
      <label className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Customer</span>
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
  );
}
