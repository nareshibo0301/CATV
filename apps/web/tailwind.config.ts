import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        sidebar: 'var(--sidebar)',
        primary: 'var(--primary)',
        'primary-light': 'var(--primary-light)',
        'primary-deep': 'var(--primary-deep)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        border: 'var(--border)',
        danger: 'var(--danger)',
        ring: 'var(--ring)',
        wine: {
          dark: 'var(--primary-deep)',
          ember: 'var(--primary)',
          neon: 'var(--primary-light)',
        },
      },
      boxShadow: {
        glow: 'var(--glow)',
        'glow-subtle': 'var(--glow)',
        'glow-wine': 'var(--glow)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
