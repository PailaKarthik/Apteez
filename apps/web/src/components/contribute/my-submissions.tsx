'use client';

import { ArrowLeft, Pencil } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import type { ContributionMineItemDto } from '@apteez/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Pagination,
  cn,
} from '@apteez/ui';
import { ContributionForm } from './contribution-form';
import { useContributionDetail, useMyContributions } from '@/hooks/use-contributions';

const STATUS_TONE = {
  PENDING: 'warning',
  UNDER_REVIEW: 'default',
  APPROVED: 'success',
  REJECTED: 'destructive',
} as const;

const PAGE_SIZE = 10;

const STATUS_STRIP: Record<string, string> = {
  PENDING: 'from-warning to-warning/30',
  UNDER_REVIEW: 'from-primary to-accent-foreground',
  APPROVED: 'from-success to-success/40',
  REJECTED: 'from-destructive to-destructive/40',
};

function SubmissionRow({
  item,
  onRevise,
  index = 0,
}: {
  item: ContributionMineItemDto;
  onRevise: (item: ContributionMineItemDto) => void;
  index?: number;
}): React.JSX.Element {
  return (
    <div className="row-enter" style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}>
    <Card className="card-lift overflow-hidden">
      <span
        className={`block h-1 bg-gradient-to-r ${STATUS_STRIP[item.status] ?? 'from-muted-foreground/30 to-transparent'}`}
        aria-hidden
      />
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_TONE[item.status] ?? 'secondary'}>
            {item.status.replace(/_/g, ' ')}
          </Badge>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {item.title}
          </p>
          {item.resultingProblemId ? (
            <Button variant="ghost" size="sm" asChild className="shrink-0 transition-all hover:gap-2.5 hover:text-primary">
              <Link href={`/problems/${item.resultingProblemId}`} aria-label="problem">
                View published →
              </Link>
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Submitted {new Date(item.submittedAt).toLocaleString()}
        </p>
        {item.feedback ? (
          <div className="flex gap-2 rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2.5 text-xs">
            <span className="icon-tile size-6 shrink-0" aria-hidden>
              <span className="text-[10px] font-extrabold">R</span>
            </span>
            <p className="min-w-0 text-foreground">
              <span className="font-semibold text-primary">Reviewer feedback: </span>
              {item.feedback}
            </p>
          </div>
        ) : null}
        {item.status === 'PENDING' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRevise(item)}
            className="transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md hover:shadow-primary/15"
          >
            <Pencil aria-hidden />
            Revise
          </Button>
        ) : item.status === 'UNDER_REVIEW' ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="live-dot" aria-hidden />
            A reviewer is looking at this now.
          </p>
        ) : item.status === 'APPROVED' ? (
          <p className="text-xs font-medium text-success">Approved — live in the library.</p>
        ) : null}
      </CardContent>
    </Card>
    </div>
  );
}

/**
 * The contributor's server-side submissions: live statuses, reviewer
 * feedback, and one-click revise for anything still pending.
 */
export function MySubmissions(): React.JSX.Element {
  const [page, setPage] = React.useState(1);
  const [revising, setRevising] = React.useState<ContributionMineItemDto | null>(null);
  const list = useMyContributions(page, PAGE_SIZE);
  const detail = useContributionDetail(revising?.id);

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));
  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (revising) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setRevising(null)}>
          <ArrowLeft aria-hidden />
          Back to submissions
        </Button>
        {detail.isPending ? (
          <div className="animate-fade-in space-y-3" aria-busy="true" aria-label="Loading your submission">
            <div className="loading-rail h-1" aria-hidden>
              <span />
            </div>
            <div className="rounded-xl border border-border p-5">
              <div className="skeleton-shine h-6 w-1/2 rounded-md" />
              <div className="skeleton-shine mt-3 h-24 w-full rounded-xl" />
            </div>
          </div>
        ) : detail.isError || !detail.data ? (
          <ErrorState title="Could not load it" onRetry={() => void detail.refetch()} />
        ) : (
          <ContributionForm
            key={detail.data.id}
            reviseId={detail.data.id}
            initial={{
              type: 'QUANTITATIVE',
              difficulty: (detail.data.difficulty as 'EASY' | 'MEDIUM' | 'HARD' | null) ?? 'MEDIUM',
              categorySlug: detail.data.categorySlug ?? '',
              topic: detail.data.topicName ?? '',
              rating: detail.data.rating ?? undefined,
              examTagSlugs: detail.data.examTagSlugs,
              source: detail.data.source ?? '',
              statement: detail.data.statement,
              assets: (detail.data.assets ?? []).map((asset) => ({
                key: asset.key,
                kind: asset.kind,
                mimeType: asset.mimeType as
                  | 'image/jpeg'
                  | 'image/png'
                  | 'image/webp'
                  | 'image/gif'
                  | 'image/avif',
                sizeBytes: asset.sizeBytes,
                ...(asset.altText ? { altText: asset.altText } : {}),
              })),
              options: detail.data.options.map((o) => ({
                text: o.text ?? '',
                ...(o.assetKey ? { assetKey: o.assetKey } : {}),
              })),
              correctAnswerIndex: detail.data.correctAnswerIndex ?? 0,
              explanation: detail.data.explanation ?? '',
              sourceUrl: detail.data.sourceUrl ?? '',
            }}
            onSaved={() => undefined}
            onRevised={() => {
              setRevising(null);
              void list.refetch();
            }}
          />
        )}
        <p className="-mt-2 text-xs text-muted-foreground">
          The correct answer, topic and source reset here — re-mark the answer before saving.
        </p>
      </div>
    );
  }

  if (list.isPending) {
    return (
      <div className="animate-fade-in space-y-3" aria-busy="true" aria-label="Loading your submissions">
        <div className="loading-rail h-1" aria-hidden>
          <span />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="animate-fade-up overflow-hidden" style={{ animationDelay: `${i * 70}ms` }} aria-hidden>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <div className="skeleton-shine h-5 w-24 rounded-full" />
                <div className="skeleton-shine h-4 flex-1 rounded-md" />
              </div>
              <div className="skeleton-shine h-3 w-2/3 rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  if (list.isError || !list.data) {
    return <ErrorState title="Could not load submissions" onRetry={() => void list.refetch()} />;
  }
  if (list.data.items.length === 0) {
    return (
      <Card className="animate-scale-in border-dashed border-primary/30 bg-primary/[0.03]">
        <CardContent className="p-8 text-center">
          <EmptyState
            title="Nothing submitted yet"
            description="Compose a question — it lands in the review queue and reviewers get notified."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-3', list.isFetching ? 'opacity-70' : null)}>
      <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground" aria-live="polite">
        Showing <span className="gradient-text-cool font-metric font-bold">{list.data.items.length}</span> of{' '}
        <span className="font-metric">{list.data.total}</span>
        {list.isFetching ? <span className="typing-dots">updating</span> : ''}
      </p>
      {list.data.items.map((item, index) => (
        <SubmissionRow key={item.id} item={item} onRevise={setRevising} index={index} />
      ))}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
