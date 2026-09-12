'use client';

import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import * as React from 'react';
import { Button } from './button';
import { cn } from '../../lib/utils';

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  /** Total page count. */
  totalPages: number;
  /** Called with the target page (1..totalPages). */
  onPageChange: (page: number) => void;
  className?: string;
}

function pageWindow(current: number, total: number): Array<number | 'gap-left' | 'gap-right'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages: Array<number | 'gap-left' | 'gap-right'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) {
    pages.push('gap-left');
  }
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  if (end < total - 1) {
    pages.push('gap-right');
  }
  if (total > 1) {
    pages.push(total);
  }
  return pages;
}

/**
 * Accessible pagination: nav landmark, aria-current on the active page,
 * disabled state on the boundary arrows.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: PaginationProps): React.JSX.Element | null {
  if (totalPages <= 1) {
    return null;
  }
  const items = pageWindow(page, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex items-center justify-center gap-1', className)}
    >
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft aria-hidden />
      </Button>
      {items.map((item) =>
        typeof item === 'number' ? (
          <button
            key={item}
            type="button"
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onPageChange(item)}
            className={cn(
              'flex size-8 items-center justify-center rounded-lg border text-sm font-medium transition-colors',
              item === page
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-elevated text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <span className="font-metric">{item}</span>
          </button>
        ) : (
          <span
            key={item}
            className="flex size-8 items-center justify-center text-muted-foreground"
            aria-hidden
          >
            <MoreHorizontal className="size-4" />
          </span>
        ),
      )}
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Next page"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  );
}
