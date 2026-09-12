'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';
import { cn } from '@apteez/ui';

const OPTIONS = [
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
  { value: 'system', label: 'System theme', Icon: Monitor },
] as const;

type ThemeValue = (typeof OPTIONS)[number]['value'];

/**
 * Segmented theme control: light / dark / system. next-themes persists the
 * choice in localStorage; `system` keeps following the OS preference.
 */
export function ThemeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Before hydration the choice is unknown; render a neutral placeholder
  // with identical dimensions so the top bar never shifts.
  if (!mounted) {
    return (
      <div
        role="radiogroup"
        aria-label="Color theme"
        className="flex h-8 items-center gap-0.5 rounded-lg border border-border bg-elevated p-0.5"
      >
        {OPTIONS.map(({ value, label, Icon }) => (
          <span
            key={value}
            aria-label={label}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground"
          >
            <Icon className="size-4" aria-hidden />
          </span>
        ))}
      </div>
    );
  }

  const current = (THEME_VALUES.has(theme as ThemeValue) ? theme : 'system') as ThemeValue;

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="flex h-8 items-center gap-0.5 rounded-lg border border-border bg-elevated p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'flex size-7 items-center justify-center rounded-md transition-colors duration-fast',
              selected
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

const THEME_VALUES = new Set<string>(['light', 'dark', 'system']);
