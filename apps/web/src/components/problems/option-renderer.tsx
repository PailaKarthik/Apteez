'use client';

import type { ProblemOptionDto } from '@apteez/types';
import { cn } from '@apteez/ui';

export interface OptionRendererProps {
  option: ProblemOptionDto;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: (optionId: string) => void;
  className?: string;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Answer-option control supporting text, image and combined options. It
 * never knows or reveals correctness — grading is server-side.
 */
export function OptionRenderer({
  option,
  selected = false,
  disabled = false,
  onSelect,
  className,
}: OptionRendererProps): React.JSX.Element {
  const interactive = Boolean(onSelect) && !disabled;
  const letter = LETTERS[option.position] ?? String(option.position + 1);

  return (
    <button
      type="button"
      onClick={interactive ? () => onSelect?.(option.id) : undefined}
      disabled={!interactive}
      aria-pressed={interactive ? selected : undefined}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4',
        selected ? 'border-primary bg-primary/10' : 'border-border bg-elevated',
        interactive
          ? 'cursor-pointer hover:border-primary/60 hover:bg-accent/50 active:scale-[0.99]'
          : 'cursor-not-allowed opacity-70',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background text-muted-foreground',
        )}
      >
        {letter}
      </span>
      <span className="min-w-0 flex-1 space-y-2">
        {option.text ? (
          <span className="block text-sm leading-relaxed text-foreground sm:text-[15px]">
            {option.text}
          </span>
        ) : null}
        {option.assetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- storage assets may be SVG
          <img
            src={option.assetUrl}
            alt={`Option ${letter}`}
            loading="lazy"
            className="max-h-40 w-auto max-w-full rounded-lg border border-border object-contain"
          />
        ) : null}
      </span>
    </button>
  );
}
