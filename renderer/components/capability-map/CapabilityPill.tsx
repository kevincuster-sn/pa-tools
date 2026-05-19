'use client';

import { memo } from 'react';
import type { Capability } from '../../data/types';

interface Props {
  capability: Capability;
  disabled: boolean;
}

function CapabilityPillImpl({ capability, disabled }: Props) {
  return (
    <div
      role="listitem"
      aria-label={capability.name}
      title={capability.name}
      tabIndex={disabled ? -1 : 0}
      className={[
        'flex h-7 items-center truncate rounded-sm border border-border bg-bg px-2 text-xs text-fg',
        'focus:outline-none focus:ring-1 focus:ring-accent',
        disabled ? 'pointer-events-none opacity-50' : '',
      ].join(' ')}
    >
      <span className="truncate">{capability.name}</span>
    </div>
  );
}

export const CapabilityPill = memo(CapabilityPillImpl);
