'use client';

import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Route,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'capability-map', label: 'Capability Map', icon: LayoutGrid },
  { id: 'adoption-roadmap', label: 'Adoption Roadmap', icon: Route, disabled: true },
  { id: 'technical-roadmap', label: 'Technical Roadmap', icon: Wrench, disabled: true },
];

export function Sidebar({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="flex flex-col border-r border-border bg-bg-elevated transition-[width] duration-150"
      style={{ width: collapsed ? 44 : 240 }}
    >
      <div className="flex h-9 items-center justify-between border-b border-border px-2">
        {!collapsed && (
          <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
            Navigate
          </span>
        )}
        <button
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-sm text-fg-subtle hover:bg-bg-sunken hover:text-fg"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => !item.disabled && onSelect(item.id)}
              title={collapsed ? item.label : undefined}
              className={[
                'group flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm',
                'border-l-2',
                isActive
                  ? 'border-accent bg-bg-sunken text-fg'
                  : 'border-transparent text-fg-muted',
                item.disabled
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:bg-bg-sunken hover:text-fg',
              ].join(' ')}
            >
              <Icon size={15} className="shrink-0" />
              {!collapsed && (
                <span className="flex-1 truncate">
                  {item.label}
                  {item.disabled && <span className="ml-1 text-xs text-fg-subtle">(soon)</span>}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
