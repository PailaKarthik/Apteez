'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardTitle, Skeleton } from '@apteez/ui';
import { ApiError } from '@/lib/api-client';
import { usePerformanceCoach } from '@/hooks/use-coach';

/**
 * Performance Coach card. Honest by construction: the copy says the advice
 * is based on recent activity, confidence is a plain label (never a score),
 * and the deterministic fallback is disclosed rather than hidden.
 */
export function PerformanceCoach(): React.JSX.Element {
  const coach = usePerformanceCoach();

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-card-title">Performance Coach</CardTitle>
          {coach.data ? (
            <Badge variant="outline">
              {coach.data.source === 'llm' ? 'AI-assisted' : 'Summary'} ·{' '}
              {coach.data.response.confidence} confidence
            </Badge>
          ) : null}
        </div>
        {!coach.data ? (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Based on your recent performance, get a grounded study plan for next week — strengths,
              weak areas, and problems worth drilling.
            </p>
            {coach.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {coach.error instanceof ApiError
                  ? coach.error.message
                  : 'Coaching is unavailable right now.'}{' '}
              </p>
            ) : null}
            <Button onClick={() => coach.mutate()} disabled={coach.isPending}>
              <Sparkles aria-hidden />
              {coach.isPending ? 'Analyzing…' : 'Generate my coaching'}
            </Button>
          </div>
        ) : coach.isPending ? (
          <div className="space-y-2" aria-label="Loading coaching">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-foreground">{coach.data.response.summary}</p>
            {coach.data.response.strengths.length > 0 ? (
              <Section title="Strengths" items={coach.data.response.strengths} />
            ) : null}
            {coach.data.response.weakAreas.length > 0 ? (
              <Section title="Weak areas" items={coach.data.response.weakAreas} />
            ) : null}
            {coach.data.response.recommendations.length > 0 ? (
              <Section title="Recommended next steps" items={coach.data.response.recommendations} />
            ) : null}
            {coach.data.response.suggestedProblems.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Suggested problems</p>
                <ul className="space-y-1">
                  {coach.data.response.suggestedProblems.map((problemId) => (
                    <li key={problemId}>
                      <Link
                        href={`/problems/${problemId}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Practice this problem
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => coach.mutate()}
                disabled={coach.isPending}
              >
                {coach.isPending ? 'Regenerating…' : 'Regenerate'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => coach.reset()}>
                Dismiss
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Coaching reflects your recorded activity and may be incomplete for new accounts.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, items }: { title: string; items: string[] }): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
