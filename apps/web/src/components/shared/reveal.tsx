'use client';

import * as React from 'react';
import { cn } from '@apteez/ui';

export interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Stagger step 0–6 → maps to .stagger-N delay. */
  stagger?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  variant?: 'up' | 'scale';
  as?: 'div' | 'section' | 'li' | 'span';
}

/**
 * Scroll-reveal wrapper: fades + rises content into view the first time it
 * enters the viewport. CSS-driven (GPU transform/opacity only), SSR-safe —
 * content is visible by default if IntersectionObserver is unavailable.
 */
export function Reveal({
  children,
  className,
  stagger = 0,
  variant = 'up',
  as = 'div',
}: RevealProps): React.JSX.Element {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-visible');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const Tag = as as 'div';

  return (
    <Tag
      ref={ref}
      className={cn(
        variant === 'scale' ? 'reveal-scale' : 'reveal',
        stagger > 0 && `stagger-${stagger}`,
        className,
      )}
    >
      {children}
    </Tag>
  );
}
