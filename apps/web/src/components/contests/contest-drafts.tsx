'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardContent, Progress } from '@apteez/ui';
import { useAdminAccess } from '@/hooks/use-admin';
import { useContestDrafts } from '@/hooks/use-contests';

/**
 * Resume list for unfinished contest setups. Drafts live on the server keyed
 * by id (the manage page route), so leaving and coming back — even after a
 * refresh — lands exactly where the question-adding left off.
 */
export function ContestDrafts(): React.JSX.Element | null {
  const access = useAdminAccess(['manage:contests']);
  const drafts = useContestDrafts(access.allowed);

  if (!access.allowed || drafts.isPending || drafts.isError || (drafts.data ?? []).length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-section-title text-foreground">Unfinished setups</h2>
          <p className="text-xs text-muted-foreground">pick up where you left off</p>
        </div>
        <ul className="space-y-2">
          {(drafts.data ?? []).map((draft) => (
            <li
              key={draft.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-elevated p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{draft.title}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-metric">{draft.addedCount}</span> of{' '}
                  <span className="font-metric">{draft.questionCount}</span> questions ·{' '}
                  {draft.durationMinutes} min
                </p>
                <Progress
                  className="mt-2"
                  value={(draft.addedCount / Math.max(1, draft.questionCount)) * 100}
                />
              </div>
              <Button size="sm" asChild>
                <Link href={`/contests/${draft.id}/manage`}>
                  Continue setup
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
