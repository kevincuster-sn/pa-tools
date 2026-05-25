'use client';

import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  onAdd: (name: string) => void;
}

export function AddCategoryTile({ onAdd }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const trimmed = value.trim();
    if (trimmed) onAdd(trimmed);
    setValue('');
    setEditing(false);
  }

  function cancel() {
    setValue('');
    setEditing(false);
  }

  return (
    <section
      className="flex h-full min-h-[88px] flex-col items-stretch justify-center rounded border border-dashed border-border bg-bg-elevated/40 p-2"
      aria-label="Add custom category"
    >
      {editing ? (
        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') cancel();
            }}
            placeholder="Category name"
            aria-label="New category name"
            className="h-7 rounded-sm border border-border bg-bg px-2 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={cancel}
              className="h-6 rounded-sm px-2 text-xs text-fg-muted hover:bg-bg-sunken hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={!value.trim()}
              className="h-6 rounded-sm bg-accent px-2 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex h-full w-full items-center justify-center gap-1.5 rounded text-xs font-medium text-fg-muted hover:bg-bg-sunken hover:text-fg focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <Plus size={14} aria-hidden="true" />
          <span>New category</span>
        </button>
      )}
    </section>
  );
}
