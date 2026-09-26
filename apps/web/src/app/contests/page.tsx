'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@apteez/ui';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ContestCard } from '@/components/contests/contest-card';
import { ContestDrafts } from '@/components/contests/contest-drafts';
import { ApiError } from '@/lib/api-client';
import { useAdminAccess } from '@/hooks/use-admin';
import { useContests } from '@/hooks/use-contests';

const PHASES = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
] as const;

export default function ContestsPage(): React.JSX.Element {
  const [phase, setPhase] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Contests always mix easy→hard problems, so there is no difficulty
  // filter — only the phase tabs below. "All" omits the phase entirely.
  const query = useMemo(
    () => ({
      ...(phase === 'all' ? {} : { phase: phase as 'live' | 'upcoming' | 'past' }),
      page,
      pageSize: 12,
    }),
    [phase, page],
  );
  const { data, isLoading, isError, error, refetch } = useContests(query);
  const createAccess = useAdminAccess(['manage:contests']);

  const totalPages = data?.meta.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contests"
        description="Scheduled competitions with ratings on the line — registration, live standings and results, all computed server-side."
        actions={
          createAccess.allowed ? (
            <Button asChild>
              <Link href="/contests/new">
                <Plus aria-hidden />
                Create contest
              </Link>
            </Button>
          ) : undefined
        }
      />
      <ContestDrafts />
      <Tabs
        value={phase}
        onValueChange={(value) => {
          setPhase(value);
          setPage(1);
        }}
      >
        <TabsList>
          {PHASES.map((p) => (
            <TabsTrigger key={p.value} value={p.value}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {isLoading ? (
        <LoadingState title="Loading contests…" />
      ) : isError ? (
        <ErrorState
          description={error instanceof ApiError ? error.message : 'Could not load contests.'}
          onRetry={() => {
            void refetch().catch((e: unknown) =>
              toast.error(e instanceof Error ? e.message : 'Retry failed'),
            );
          }}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No contests found"
          description="Try a different phase — new contests open regularly."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((contest) => (
              <ContestCard key={contest.id} contest={contest} />
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page <span className="font-metric">{page}</span> of{' '}
                <span className="font-metric">{totalPages}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
