'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  EmptyState,
  ErrorState,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@apteez/ui';
import Link from 'next/link';
import { Plus, Swords, Trophy } from 'lucide-react';
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

function ContestSkeletonGrid(): React.JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading contests">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="animate-fade-up overflow-hidden rounded-xl border border-border"
          style={{ animationDelay: `${i * 70}ms` }}
          aria-hidden
        >
          <div className="loading-rail h-1" aria-hidden>
            <span />
          </div>
          <div className="space-y-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="skeleton-shine h-5 w-2/3 rounded-md" />
              <div className="skeleton-shine h-5 w-16 rounded-full" />
            </div>
            <div className="skeleton-shine h-3 w-full rounded-md" />
            <div className="skeleton-shine h-3 w-4/5 rounded-md" />
            <div className="flex gap-2 pt-1">
              <div className="skeleton-shine h-7 w-20 rounded-md" />
              <div className="skeleton-shine h-7 w-20 rounded-md" />
              <div className="skeleton-shine h-7 w-20 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

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
  const liveCount = data?.items.filter((c) => c.phase === 'live').length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={liveCount > 0 ? `${liveCount} live right now` : 'Compete · Rate · Rise'}
        title="Contests"
        description="Scheduled competitions with ratings on the line — registration, live standings and results, all computed server-side."
        actions={
          createAccess.allowed ? (
            <Button asChild className="btn-sheen shadow-lg shadow-primary/20">
              <Link href="/contests/new">
                <Plus aria-hidden />
                Create contest
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Arena strip */}
      <div className="page-enter-1 relative overflow-hidden rounded-2xl border border-border">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.12] via-primary/[0.05] to-accent/60" aria-hidden />
        <div className="aurora-field" aria-hidden>
          <span className="aurora-orb -left-10 -top-16 size-52 bg-primary/25" />
          <span className="aurora-orb right-[10%] top-[-40%] size-56 bg-primary/15 [animation-delay:-6s]" />
        </div>
        <div className="relative flex flex-wrap items-center gap-4 p-5 sm:px-6">
          <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent-foreground text-white shadow-lg shadow-primary/30">
            <Trophy className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">The arena never sleeps</p>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Register early, enter on time — ratings move with every contest you finish.
            </p>
          </div>
          <Button variant="outline" asChild className="glass shrink-0">
            <Link href="/leaderboard">
              <Swords aria-hidden />
              Leaderboard
            </Link>
          </Button>
        </div>
      </div>

      <ContestDrafts />
      <Tabs
        value={phase}
        onValueChange={(value) => {
          setPhase(value);
          setPage(1);
        }}
      >
        <TabsList className="glass sticky top-top-bar z-10 shadow-sm">
          {PHASES.map((p) => (
            <TabsTrigger key={p.value} value={p.value} className="gap-1.5">
              {p.value === 'live' ? <span className="live-dot" aria-hidden /> : null}
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {isLoading ? (
        <ContestSkeletonGrid />
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
            {data.items.map((contest, index) => (
              <div
                key={contest.id}
                className="animate-fade-up"
                style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
              >
                <ContestCard contest={contest} />
              </div>
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="glass mx-auto flex w-fit items-center justify-center gap-2 rounded-full border border-border px-3 py-1.5 shadow-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-full transition-all hover:-translate-x-0.5"
              >
                Previous
              </Button>
              <span className="px-1 text-sm text-muted-foreground">
                Page <span className="gradient-text-cool font-metric font-bold">{page}</span> of{' '}
                <span className="font-metric">{totalPages}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-full transition-all hover:translate-x-0.5"
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
