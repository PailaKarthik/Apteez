import type { ProblemAssetDto } from '@apteez/types';
import { cn } from '@apteez/ui';

export interface QuestionRendererProps {
  /** Null for image-only questions. */
  statement: string | null;
  assets: ProblemAssetDto[];
  className?: string;
}

function AssetFigure({ asset }: { asset: ProblemAssetDto }): React.JSX.Element | null {
  if (!asset.url) {
    return null;
  }
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-elevated">
      {/* eslint-disable-next-line @next/next/no-img-element -- storage assets may be SVG, which next/image cannot optimise */}
      <img
        src={asset.url}
        alt={asset.altText ?? 'Question illustration'}
        loading="lazy"
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
  const images = assets.filter((asset) => asset.url);
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
