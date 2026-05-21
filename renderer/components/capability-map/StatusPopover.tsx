'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CapabilityStatus } from '../../../shared/file-format';
import { STATUSES } from '../../lib/capability-status';

interface Props {
  anchor: HTMLElement;
  capabilityName: string;
  status: CapabilityStatus;
  notes: string;
  onStatusChange: (next: CapabilityStatus) => void;
  onNotesChange: (next: string) => void;
  onClose: () => void;
}

interface Position {
  top: number;
  left: number;
}

const POPOVER_WIDTH = 320;
const POPOVER_MARGIN = 8;

function computePosition(anchor: HTMLElement, popoverHeight: number): Position {
  const rect = anchor.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const spaceBelow = viewportH - rect.bottom;
  const spaceAbove = rect.top;
  const placement: 'below' | 'above' =
    spaceBelow >= popoverHeight + POPOVER_MARGIN || spaceBelow >= spaceAbove ? 'below' : 'above';

  const top =
    placement === 'below'
      ? rect.bottom + POPOVER_MARGIN
      : Math.max(POPOVER_MARGIN, rect.top - popoverHeight - POPOVER_MARGIN);

  const left = Math.min(
    Math.max(POPOVER_MARGIN, rect.left),
    viewportW - POPOVER_WIDTH - POPOVER_MARGIN,
  );

  return { top, left };
}

export function StatusPopover({
  anchor,
  capabilityName,
  status,
  notes,
  onStatusChange,
  onNotesChange,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    if (!ref.current) return;
    const measured = ref.current.getBoundingClientRect();
    setPos(computePosition(anchor, measured.height));
  }, [anchor]);

  // Move focus into the popover once it is positioned, restore on unmount
  useEffect(() => {
    if (pos) {
      ref.current?.focus();
    }
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [pos]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (ref.current?.contains(target)) return;
      if (anchor.contains(target)) return;
      onClose();
    }
    function onScroll() {
      if (!ref.current) return;
      const measured = ref.current.getBoundingClientRect();
      setPos(computePosition(anchor, measured.height));
    }
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDocClick, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDocClick, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [anchor, onClose]);

  const groupId = `status-radio-${capabilityName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={`Edit ${capabilityName}`}
      tabIndex={-1}
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: POPOVER_WIDTH,
        visibility: pos ? 'visible' : 'hidden',
        zIndex: 50,
      }}
      className="rounded border border-border-strong bg-bg-elevated p-3 shadow-lg"
    >
      <header className="mb-2 truncate text-sm font-medium text-fg" title={capabilityName}>
        {capabilityName}
      </header>

      <fieldset className="mb-3" aria-label="Status">
        <legend className="sr-only">Status</legend>
        <div className="flex flex-col gap-0.5">
          {STATUSES.map((s) => (
            <label
              key={s.id}
              className={[
                'flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-xs hover:bg-bg-sunken',
                status === s.id ? 'bg-bg-sunken' : '',
              ].join(' ')}
            >
              <input
                type="radio"
                name={groupId}
                value={s.id}
                checked={status === s.id}
                onChange={() => onStatusChange(s.id)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-sm border border-border-strong"
                style={{ backgroundColor: s.color }}
              />
              <span className="font-medium text-fg">{s.label}</span>
              <span className="ml-auto truncate text-fg-subtle">{s.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-fg-subtle">
          Notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={4}
          placeholder="Customer-specific context, dates, owners…"
          className="w-full resize-y rounded-sm border border-border bg-bg p-2 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
        />
      </label>
    </div>
  );
}
