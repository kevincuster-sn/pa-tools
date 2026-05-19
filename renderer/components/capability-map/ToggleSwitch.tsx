'use client';

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}

export function ToggleSwitch({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-elevated',
        checked ? 'bg-accent' : 'bg-border-strong',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-3 w-3 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-3.5' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}
