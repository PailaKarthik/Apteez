'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  EmptyState,
  ErrorState,
  cn,
} from '@apteez/ui';
import { PageHeader } from '@/components/shared/page-header';
import { OptionRenderer } from '@/components/problems/option-renderer';
import { QuestionRenderer } from '@/components/problems/question-renderer';
import { ApiError } from '@/lib/api-client';
import { useContest, useContestUpsolve } from '@/hooks/use-contests';

const CORRECTNESS_TONE = {
  correct: 'success',
  incorrect: 'destructive',
  unanswered: 'secondary',
} as const;

/** Post-contest review. Read-only: frozen results are never mutated here. */
export default function ContestUpsolvePage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: contest } = useContest(id);
  const { data, isLoading, isError, error, refetch } = useContestUpsolve(id);

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-4" aria-busy="true" aria-label="Loading solutions">
        <div className="loading-rail h-1" aria-hidden>
          <span />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="rounded-xl border border-border p-5" aria-hidden>
            <div className="skeleton-shine h-6 w-2/3 rounded-md" />
            <div className="skeleton-shine mt-3 h-20 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <ErrorState
        description={error instanceof ApiError ? error.message : 'Upsolve is not available yet.'}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Review · Learn · Repeat"
        title={`Upsolve — ${contest?.name ?? 'Contest'}`}
        description="Review every question with the official answers. Your submitted result stays untouched."
        actions={
          <Link href={`/contests/${id}`}>
            <Button variant="outline">Back to contest</Button>
          </Link>
        }
      />
      {data.result ? (
        <Card>
          <CardContent className="flex flex-wrap gap-6 p-6 text-sm">
            <span>
              Solved <span className="font-metric text-base">{data.result.solvedCount}</span>
            </span>
            <span>
              Wrong <span className="font-metric text-base">{data.result.wrongCount}</span>
            </span>
            <span>
              Rank <span className="font-metric text-base">{data.result.rank ?? '—'}</span>
            </span>
            <span>
              Rating{' '}
              <span className="font-metric text-base">
                {data.result.rating
                  ? `${data.result.rating.before} → ${data.result.rating.after}`
                  : '—'}
              </span>
            </span>
          </CardContent>
        </Card>
      ) : null}
      {data.questions.length === 0 ? (
        <EmptyState
          title="No solutions yet"
          description="Solutions appear after the contest ends."
        />
      ) : (
        <div className="space-y-4">
          {data.questions.map((question) => (
            <Card key={question.questionId}>
              <CardContent className="space-y-3 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="min-w-0 flex-1 break-words text-card-title">
                    Q{question.position + 1} · {question.title}
                  </CardTitle>
                  <Badge variant={CORRECTNESS_TONE[question.correctness]} className="shrink-0">
                    {question.correctness}
                  </Badge>
                </div>
                <QuestionRenderer statement={question.statement} assets={question.assets} />
                <div className="space-y-2">
                  {question.options.map((option) => {
                    const isCorrect = option.id === question.correctOptionId;
                    const isSelected = option.id === question.selectedOptionId;
                    return (
                      <div
                        key={option.id}
                        className={cn(
                          'rounded-lg border p-1',
                          isCorrect
                            ? 'border-success/60 bg-success/10'
                            : isSelected
                              ? 'border-destructive/60 bg-destructive/10'
                              : 'border-transparent',
                        )}
                      >
                        <OptionRenderer option={option} selected={isSelected} />
                      </div>
                    );
                  })}
                </div>
                {question.explanation ? (
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {question.explanation}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
