import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--bg)',
          elevated: 'var(--bg-elevated)',
          sunken: 'var(--bg-sunken)',
          overlay: 'var(--bg-overlay)',
        },
        fg: {
          DEFAULT: 'var(--fg)',
          muted: 'var(--fg-muted)',
          subtle: 'var(--fg-subtle)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          fg: 'var(--accent-fg)',
        },
        brand: 'var(--brand)',
        status: {
          'not-licensed': 'var(--status-not-licensed)',
          'no-intent': 'var(--status-no-intent)',
          'not-in-use': 'var(--status-not-in-use)',
          planning: 'var(--status-planning)',
          implementing: 'var(--status-implementing)',
          'in-use': 'var(--status-in-use)',
        },
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '5px',
        md: '6px',
      },
      fontSize: {
        xs: ['13px', '17px'],
        sm: ['14px', '18px'],
        base: ['15px', '20px'],
        md: ['16px', '22px'],
        lg: ['18px', '24px'],
      },
    },
  },
  plugins: [],
};

export default config;
