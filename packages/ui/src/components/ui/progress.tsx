'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

const progressVariants = cva('w-full overflow-hidden rounded-full bg-muted', {
  variants: {
    size: {
      sm: 'h-1.5',
      default: 'h-2.5',
    },
  },
  defaultVariants: { size: 'default' },
});

const indicatorVariants = cva('h-full rounded-full transition-[width] duration-base ease-apteez', {
  variants: {
    tone: {
      brand: 'bg-primary',
      success: 'bg-success',
      warning: 'bg-warning',
      gold: 'bg-gold',
    },
  },
  defaultVariants: { tone: 'brand' },
});

export interface ProgressProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressVariants>,
    VariantProps<typeof indicatorVariants> {
  /** 0–100. Values outside the range are clamped. */
  value: number;
}

/** Linear progress bar with an accessible role for screen readers. */
export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, size, tone, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        className={cn(progressVariants({ size }), className)}
        {...props}
      >
        <div className={cn(indicatorVariants({ tone }))} style={{ width: `${clamped}%` }} />
      </div>
    );
  },
);
Progress.displayName = 'Progress';
