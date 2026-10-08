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
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.94) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-18px) scale(1.04)' },
        },
        aurora: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.7' },
          '33%': { transform: 'translate(32px, -24px) scale(1.12)', opacity: '0.9' },
          '66%': { transform: 'translate(-24px, 20px) scale(0.94)', opacity: '0.6' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.72', transform: 'scale(0.96)' },
        },
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'marquee-x': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pop: {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '60%': { transform: 'scale(1.06)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'bar-slide': {
          '0%': { transform: 'translateX(-110%)' },
          '100%': { transform: 'translateX(320%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.5s ease both',
        'scale-in': 'scale-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        pop: 'pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        shimmer: 'shimmer 1.8s linear infinite',
        float: 'float 5s ease-in-out infinite',
        'float-slow': 'float-slow 8s ease-in-out infinite',
        aurora: 'aurora 14s ease-in-out infinite',
        'spin-slow': 'spin-slow 14s linear infinite',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        'gradient-pan': 'gradient-pan 8s ease infinite',
        'marquee-x': 'marquee-x 28s linear infinite',
        'bar-slide': 'bar-slide 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
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
