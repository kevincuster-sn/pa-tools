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
