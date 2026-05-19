'use client';

import { memo, useMemo } from 'react';
import type { Capability, Category } from '../../data/types';
import { matchesSearch } from '../../lib/capability-map';
import { CapabilityPill } from './CapabilityPill';
import { ToggleSwitch } from './ToggleSwitch';

interface Props {
  category: Category;
  capabilities: Capability[];
  enabled: boolean;
  searchTerm: string;
  onToggle: (next: boolean) => void;
}

function CategoryCardImpl({ category, capabilities, enabled, searchTerm, onToggle }: Props) {
  const visibleCapabilities = useMemo(() => {
    if (!searchTerm) return capabilities;
    return capabilities.filter((c) => matchesSearch(c.name, searchTerm));
  }, [capabilities, searchTerm]);

  const filteredOut = searchTerm && visibleCapabilities.length === 0;

  return (
    <section
      className={[
        'flex flex-col rounded border border-border bg-bg-elevated transition-opacity',
        enabled ? '' : 'opacity-40',
      ].join(' ')}
      aria-label={category.fullName ?? category.name}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5">
        <h3
          className="truncate text-sm font-medium text-fg"
          title={category.fullName ?? category.name}
        >
          {category.name}
        </h3>
        <ToggleSwitch checked={enabled} onChange={onToggle} label={`Enable ${category.name}`} />
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
          <CapabilityPill key={cap.id} capability={cap} disabled={!enabled} />
        ))}
      </div>
    </section>
  );
}

export const CategoryCard = memo(CategoryCardImpl);
