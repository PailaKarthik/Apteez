'use client';

import * as React from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';
import type { ProblemAssetDto } from '@apteez/types';
import { cn } from '@apteez/ui';

export interface QuestionRendererProps {
  /** Null for image-only questions. */
  statement: string | null;
  assets: ProblemAssetDto[];
  className?: string;
}

function AssetFigure({ asset }: { asset: ProblemAssetDto }): React.JSX.Element | null {
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  // Backend fault-tolerance mints '' when a storage key can't be signed
  // (stale key, region/credential blip after deploy) so the problem still
  // loads. Both '' and a broken download render a retryable placeholder —
  // never a broken-image icon and never a whole-page error.
  if (!asset.url || failed) {
    return (
      <figure className="rounded-xl border border-dashed border-border bg-elevated p-6 text-center">
        <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <ImageOff className="size-5" />
        </span>
        <p className="mt-2 text-sm font-medium text-foreground">
          {!asset.url ? 'Question image is being prepared' : 'Question image did not load'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {!asset.url
            ? 'The file reference exists but has no download URL right now. Try again shortly.'
            : 'Check your connection — the file may still be uploading to storage.'}
        </p>
        {asset.url ? (
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((count) => count + 1);
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Retry image
          </button>
        ) : null}
      </figure>
    );
  }
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-elevated">
      {/* eslint-disable-next-line @next/next/no-img-element -- storage assets may be SVG, which next/image cannot optimise */}
      <img
        key={`${asset.id}:${attempt}`}
        src={attempt > 0 ? `${asset.url}${asset.url.includes('?') ? '&' : '?'}retry=${attempt}` : asset.url}
        alt={asset.altText ?? 'Question illustration'}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="mx-auto max-h-[240px] w-auto max-w-full object-contain sm:max-h-[420px]"
      />
    </figure>
  );
}

/**
 * Renders question content in any of its three shapes (text, image, or
 * both). Shared by practice, challenge, contest and event surfaces so the
 * layout rules live in exactly one place.
 */
export function QuestionRenderer({
  statement,
  assets,
  className,
}: QuestionRendererProps): React.JSX.Element {
  const images = assets;
  const hasText = Boolean(statement && statement.trim().length > 0);

  return (
    <div className={cn('space-y-4', className)}>
      {hasText ? (
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground sm:text-base">
          {statement}
        </p>
      ) : null}
      {images.map((asset) => (
        <AssetFigure key={asset.id} asset={asset} />
      ))}
    </div>
  );
}
