'use client';

import { Download } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExportFormat } from '../../lib/export';

interface Props {
  disabled?: boolean;
  busyFormat: ExportFormat | null;
  onExport: (format: ExportFormat) => void;
}

export function ExportMenu({ disabled, busyFormat, onExport }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSelect = useCallback(
    (format: ExportFormat) => {
      setOpen(false);
      onExport(format);
    },
    [onExport],
  );

  const isBusy = busyFormat !== null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || isBusy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 items-center gap-1.5 rounded-sm border border-border bg-bg px-2 text-xs text-fg-muted hover:bg-bg-sunken hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        title="Export active capabilities"
      >
        <Download size={13} />
        <span>{isBusy ? `Exporting ${busyFormat?.toUpperCase()}…` : 'Export'}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-sm border border-border bg-bg-overlay shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => handleSelect('pdf')}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-fg hover:bg-bg-sunken"
          >
            <span>Export as PDF</span>
            <span className="text-fg-subtle">.pdf</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleSelect('pptx')}
            className="flex w-full items-center justify-between border-t border-border px-3 py-1.5 text-left text-xs text-fg hover:bg-bg-sunken"
          >
            <span>Export as PowerPoint</span>
            <span className="text-fg-subtle">.pptx</span>
          </button>
        </div>
      )}
    </div>
  );
}
