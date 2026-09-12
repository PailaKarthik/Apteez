import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        elevated: 'hsl(var(--elevated))',
        hover: 'hsl(var(--hover))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        gold: 'hsl(var(--gold))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        'subtle-foreground': 'hsl(var(--subtle-foreground))',
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        metric: ['var(--font-metric)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Typography tokens: page title / section title / card title /
        // body / muted / labels / metadata — one scale, no ad-hoc sizes.
        'page-title': [
          '1.875rem',
          { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '700' },
        ],
        'section-title': [
          '1.25rem',
          { lineHeight: '1.75rem', letterSpacing: '-0.01em', fontWeight: '600' },
        ],
        'card-title': ['1rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        label: ['0.875rem', { lineHeight: '1.25rem', fontWeight: '500' }],
        metadata: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
        stat: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em', fontWeight: '700' }],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionTimingFunction: {
        apteez: 'var(--ease)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
      },
      spacing: {
        // Component height tokens keep controls consistent app-wide.
        'control-sm': '2rem',
        control: '2.25rem',
        'control-lg': '2.5rem',
        'top-bar': '4rem',
        sidebar: '16.5rem',
      },
    },
  },
  plugins: [animate],
};

export default config;
