'use client';

import { useEffect, useRef, useState } from 'react';
import type { CapabilityStatus } from '../../../shared/file-format';

interface Props {
  categoryName: string;
  onSetAllStatus: (status: CapabilityStatus) => void;
  onClearNotes: () => void;
}

const BULK_STATUS_OPTIONS: { status: CapabilityStatus; label: string }[] = [
  { status: 'not-licensed', label: 'Set all to Not Licensed' },
  { status: 'planning', label: 'Set all to Planning' },
  { status: 'in-use', label: 'Set all to In Use' },
];

export function CategoryBulkMenu({ categoryName, onSetAllStatus, onClearNotes }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  function handleClearNotes() {
    setOpen(false);
    const ok = window.confirm(`Clear all notes in ${categoryName}? This cannot be undone.`);
    if (ok) onClearNotes();
  }

  function handleSetAll(status: CapabilityStatus) {
    setOpen(false);
    onSetAllStatus(status);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${categoryName} bulk actions`}
        className="flex h-6 w-6 items-center justify-center rounded-sm text-fg-muted hover:bg-bg-sunken hover:text-fg focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-56 rounded border border-border-strong bg-bg-elevated p-1 shadow-lg"
        >
          {BULK_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.status}
              type="button"
              role="menuitem"
              onClick={() => handleSetAll(opt.status)}
              className="block w-full rounded-sm px-2 py-1 text-left text-xs text-fg hover:bg-bg-sunken"
            >
              {opt.label}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={handleClearNotes}
            className="block w-full rounded-sm px-2 py-1 text-left text-xs text-fg hover:bg-bg-sunken"
          >
            Clear notes
          </button>
        </div>
      )}
    </div>
  );
}
