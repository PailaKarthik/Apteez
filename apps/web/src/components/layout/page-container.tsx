import type * as React from 'react';
import { cn } from '@apteez/ui';

export interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /** Widen beyond the default content max-width (e.g. data-heavy tables). */
  width?: 'default' | 'wide';
}

/**
 * The single page-level layout primitive: max content width, horizontal
 * padding and vertical rhythm. Pages never invent their own widths.
 *
 * Breakpoints follow the Figma desktop layout: the default content column
 * targets 1280px+ comfortably; `wide` serves full-density data pages.
 * Gutters compress intentionally on tablet and mobile.
 */
export function PageContainer({
  children,
  className,
  width = 'default',
}: PageContainerProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'mx-auto w-full flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
        width === 'default' ? 'max-w-6xl' : 'max-w-7xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Vertical rhythm between stacked page sections. */
export function PageStack({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return <div className={cn('space-y-8 lg:space-y-10', className)}>{children}</div>;
}
