'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'pa-tools.theme';
const CHANGE_EVENT = 'pa-tools:theme-change';

const NEXT_THEME: Record<Theme, Theme> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const META = {
  light: { Icon: Sun, label: 'Light' },
  dark: { Icon: Moon, label: 'Dark' },
  system: { Icon: Monitor, label: 'System' },
} as const;

function readTheme(): Theme {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'dark';
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('storage', cb);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function setStoredTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

interface Props {
  variant?: 'full' | 'icon';
  collapsed?: boolean;
}

export function ThemeToggle({ variant = 'full', collapsed = false }: Props) {
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => 'dark');

  // Keep the DOM attribute in sync when the value changes via another tab/window.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const { Icon, label } = META[theme];
  const a11yLabel = `Theme: ${label}. Click to switch to ${META[NEXT_THEME[theme]].label}.`;
  const onClick = () => setStoredTheme(NEXT_THEME[theme]);

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={a11yLabel}
        title={a11yLabel}
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-fg-subtle hover:bg-bg-sunken hover:text-fg focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <Icon size={13} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={a11yLabel}
      title={collapsed ? a11yLabel : undefined}
      className={[
        'group flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-fg-muted',
        'border-l-2 border-transparent hover:bg-bg-sunken hover:text-fg',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
      ].join(' ')}
    >
      <Icon size={15} className="shrink-0" />
      {!collapsed && (
        <span className="flex-1 truncate">
          Theme<span className="ml-1 text-xs text-fg-subtle">({label})</span>
        </span>
      )}
    </button>
  );
}
