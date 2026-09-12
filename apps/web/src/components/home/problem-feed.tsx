'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button, SectionHeader } from '@apteez/ui';
import { useProblemsFeed } from '@/hooks/use-problems';
import { ProblemList } from '@/components/problems/problem-list';

/** Newest published problems, live from the API — the Home list surface. */
export function ProblemFeed(): React.JSX.Element {
  const feed = useProblemsFeed({ sort: 'newest' }, 6);

  return (
    <section aria-label="Latest problems" className="space-y-4">
      <SectionHeader
        title="Fresh from the library"
        description="Newly published aptitude problems across every category."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/explore">
              View all
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />
      <ProblemList
        problems={feed.problems}
        isPending={feed.isPending}
        isError={feed.isError}
        hasNextPage={false}
        isFetchingNextPage={false}
        onRetry={() => void feed.refetch()}
        onLoadMore={() => undefined}
      />
    </section>
  );
}
