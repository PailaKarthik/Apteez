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
  LoadingState,
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

function SubmissionRow({
  item,
  onRevise,
}: {
  item: ContributionMineItemDto;
  onRevise: (item: ContributionMineItemDto) => void;
}): React.JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_TONE[item.status] ?? 'secondary'}>
            {item.status.replace(/_/g, ' ')}
          </Badge>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {item.title}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Submitted {new Date(item.submittedAt).toLocaleString()}
          {item.resultingProblemId ? (
            <>
              {' · published as '}
              <Link
                href={`/problems/${item.resultingProblemId}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                problem
              </Link>
            </>
          ) : null}
        </p>
        {item.feedback ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-foreground">
            <span className="font-semibold">Reviewer feedback: </span>
            {item.feedback}
          </p>
        ) : null}
        {item.status === 'PENDING' ? (
          <Button variant="outline" size="sm" onClick={() => onRevise(item)}>
            <Pencil aria-hidden />
            Revise
          </Button>
        ) : item.status === 'UNDER_REVIEW' ? (
          <p className="text-xs text-muted-foreground">A reviewer is looking at this now.</p>
        ) : null}
      </CardContent>
    </Card>
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
          <LoadingState title="Loading your submission…" />
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
              options: detail.data.options.map((o) => ({ text: o.text ?? '' })),
              correctAnswerIndex: 0,
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
    return <LoadingState title="Loading your submissions…" />;
  }
  if (list.isError || !list.data) {
    return <ErrorState title="Could not load submissions" onRetry={() => void list.refetch()} />;
  }
  if (list.data.items.length === 0) {
    return (
      <EmptyState
        title="Nothing submitted yet"
        description="Compose a question — it lands in the review queue and reviewers get notified."
      />
    );
  }

  return (
    <div className={cn('space-y-3', list.isFetching ? 'opacity-70' : null)}>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Showing <span className="font-metric">{list.data.items.length}</span> of{' '}
        <span className="font-metric">{list.data.total}</span>
        {list.isFetching ? ' · updating…' : ''}
      </p>
      {list.data.items.map((item) => (
        <SubmissionRow key={item.id} item={item} onRevise={setRevising} />
      ))}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
