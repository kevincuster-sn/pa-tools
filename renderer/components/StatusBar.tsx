'use client';

import { useEffect, useState } from 'react';
import { Circle } from 'lucide-react';
import { fileNameFromPath, useDocumentStore } from '../state/document';

function formatRelative(ts: number, now: number): string {
  const delta = Math.max(0, Math.floor((now - ts) / 1000));
  if (delta < 5) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return new Date(ts).toLocaleString();
}

export function StatusBar() {
  const filePath = useDocumentStore((s) => s.currentFilePath);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const lastSavedAt = useDocumentStore((s) => s.lastSavedAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lastSavedAt) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  const fileName = fileNameFromPath(filePath);

  return (
    <footer className="flex h-6 items-center justify-between gap-3 border-t border-border bg-bg-elevated px-2 text-xs text-fg-muted">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-fg">{fileName}</span>
        {filePath && (
          <span className="hidden truncate text-fg-subtle md:inline" title={filePath}>
            {filePath}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {isDirty ? (
          <span className="inline-flex items-center gap-1 text-fg">
            <Circle size={8} className="fill-current text-status-not-in-use" />
            Unsaved changes
          </span>
        ) : (
          lastSavedAt && (
            <span className="text-fg-subtle">Saved {formatRelative(lastSavedAt, now)}</span>
          )
        )}
      </div>
    </footer>
  );
}
