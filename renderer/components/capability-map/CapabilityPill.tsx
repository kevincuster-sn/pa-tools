'use client';

import { memo } from 'react';
import type { Capability } from '../../data/types';
import type { CapabilityStatus } from '../../../shared/file-format';
import { STATUS_META } from '../../lib/capability-status';

interface Props {
  capability: Capability;
  status: CapabilityStatus;
  hasNotes: boolean;
  disabled: boolean;
  selected?: boolean;
  onClick?: (capabilityId: string, anchor: HTMLElement) => void;
}

function CapabilityPillImpl({ capability, status, hasNotes, disabled, selected, onClick }: Props) {
  const meta = STATUS_META[status];
  const interactive = !disabled && Boolean(onClick);

  return (
    <div role="listitem" className="w-full">
      <button
        type="button"
        aria-label={`${capability.name} — ${meta.label}${hasNotes ? ', has notes' : ''}`}
        title={capability.name}
        disabled={disabled}
        aria-pressed={selected ?? undefined}
        onClick={(e) => {
          if (!interactive) return;
          onClick!(capability.id, e.currentTarget);
        }}
        className={[
          'relative flex h-7 w-full items-center gap-1.5 truncate rounded-sm border border-border pl-3 pr-2 text-left text-xs text-fg',
          'focus:outline-none focus:ring-1 focus:ring-accent',
          disabled ? 'pointer-events-none opacity-50 saturate-0' : 'hover:border-border-strong',
          selected ? 'ring-1 ring-accent' : '',
        ].join(' ')}
        style={{
          // ~7% tint of status color over bg
          backgroundColor: `color-mix(in srgb, ${meta.color} 7%, var(--bg))`,
        }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[5px] rounded-l-sm"
          style={{ backgroundColor: meta.color }}
        />
        <span className="truncate">{capability.name}</span>
        {hasNotes && (
          <span
            aria-hidden="true"
            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-fg-subtle"
          />
        )}
      </button>
    </div>
  );
}

export const CapabilityPill = memo(CapabilityPillImpl);
