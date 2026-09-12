'use client';

import type { LearningContentBlock } from '@apteez/types';
import { cn } from '@apteez/ui';

/**
 * Renders every learning content block kind through one component — the
 * concept explanations, formulas, examples, notes, images and lists all live
 * here so content rendering rules stay in exactly one place. Renders plain
 * text (no dangerous HTML), keeps a reading-friendly width, and every block
 * is keyboard/AT-friendly.
 */
export function LessonContent({ blocks }: { blocks: LearningContentBlock[] }): React.JSX.Element {
  if (blocks.length === 0) {
    return <p className="text-muted-foreground">This lesson has no content yet.</p>;
  }
  return (
    <div className="prose-apteez mx-auto max-w-prose space-y-4">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return (
              <h2
                key={index}
                className="pt-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl"
              >
                {block.value}
              </h2>
            );
          case 'formula':
            return (
              <div
                key={index}
                className="overflow-x-auto rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
              >
                <code className="block font-mono text-sm text-foreground sm:text-[15px]">
                  {block.value}
                </code>
              </div>
            );
          case 'note':
            return (
              <aside
                key={index}
                className="rounded-xl border border-amber-600/25 bg-amber-600/5 p-4 text-sm leading-relaxed text-foreground/90"
              >
                <span className="mb-1 block text-metadata font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                  Note
                </span>
                {block.value}
              </aside>
            );
          case 'example':
            return (
              <aside
                key={index}
                className="rounded-xl border border-border bg-elevated p-4 text-sm leading-relaxed text-foreground/90 sm:text-[15px]"
              >
                <span className="mb-1 block text-metadata font-semibold uppercase tracking-widest text-subtle-foreground">
                  Example
                </span>
                {block.value}
              </aside>
            );
          case 'list':
            return (
              <div key={index} className="rounded-xl border border-border bg-elevated p-4">
                <p className="mb-2 text-sm font-semibold text-foreground">{block.value}</p>
                <ul className="space-y-1.5 text-sm leading-relaxed text-foreground/90">
                  {block.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="flex gap-2">
                      <span aria-hidden className="text-primary">
                        •
                      </span>
                      <span className="min-w-0">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          case 'image':
            return (
              <figure key={index} className="overflow-hidden rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- learning images may be SVG */}
                <img
                  src={block.url}
                  alt={block.alt ?? 'Lesson illustration'}
                  loading="lazy"
                  className="mx-auto max-h-[360px] w-auto max-w-full object-contain"
                />
              </figure>
            );
          case 'text':
          default:
            return (
              <p
                key={index}
                className={cn(
                  'whitespace-pre-line text-[15px] leading-relaxed text-foreground/90 sm:text-base',
                )}
              >
                {block.value}
              </p>
            );
        }
      })}
    </div>
  );
}
