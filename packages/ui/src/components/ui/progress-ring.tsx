'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ProgressRingProps extends React.SVGAttributes<SVGSVGElement> {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  /** Outer size in pixels. */
  size?: number;
  /** Stroke thickness in pixels. */
  strokeWidth?: number;
}

/**
 * Circular progress ring for stat cards (accuracy, target completion).
 * The value is also exposed textually to assistive technology.
 */
export function ProgressRing({
  value,
  size = 48,
  strokeWidth = 5,
  className,
  ...props
}: ProgressRingProps): React.JSX.Element {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('-rotate-90', className)}
      {...props}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-muted"
        aria-hidden
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="stroke-primary transition-[stroke-dashoffset] duration-base ease-apteez"
        aria-hidden
      />
    </svg>
  );
}
