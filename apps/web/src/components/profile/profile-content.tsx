'use client';

import { Coins, Flame, ListChecks, Target } from 'lucide-react';
import { Button, Card, CardContent, ErrorState } from '@apteez/ui';
import { ApiError } from '@/lib/api-client';
import {
  useAchievements,
  useActivityHeatmap,
  useDifficultyPerformance,
  useDomainPerformance,
  usePerformance,
  usePointsSummary,
  useProfile,
  useProfileContributions,
  useProfileEvents,
  useRatingHistory,
  useStreak,
  useTopicPerformance,
  useWeakAreas,
} from '@/hooks/use-profile';
import { AchievementsGrid } from './achievements-grid';
import { ActivityHeatmap } from './activity-heatmap';
import { CompetitiveRatings } from './competitive-ratings';
import { DifficultyPerformance, DomainPerformance, TopicPerformance } from './performance-sections';
import { PerformanceCoach } from './performance-coach';
import { ProblemAnalytics } from './problem-analytics';
import { ProfileHeader } from './profile-header';
import { RatingChart } from './rating-chart';
import { RecentActivityFeed } from './recent-activity';
import { RecentPractice } from './recent-practice';
import { WeakAreas } from './weak-areas';

const STAT_WASH: Record<string, string> = {
  Solved: 'from-primary/15 to-transparent',
  Accuracy: 'from-success/15 to-transparent',
  'Day streak': 'from-warning/15 to-transparent',
  Points: 'from-gold/15 to-transparent',
};

function StatCard({
  icon: Icon,
  label,
  value,
  index = 0,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  index?: number;
}): React.JSX.Element {
  return (
    <Card
      className="card-lift animate-fade-up relative overflow-hidden"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${STAT_WASH[label] ?? 'from-primary/10 to-transparent'}`} aria-hidden />
      <CardContent className="relative flex items-center gap-3 p-4">
        <span className="icon-tile size-10 shrink-0" aria-hidden>
          <Icon className="size-4" />
        </span>
        <span>
          <span className="block font-metric text-lg font-bold leading-none text-foreground">
            {value}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
        </span>
      </CardContent>
    </Card>
  );
}

export function ProfileContent(): React.JSX.Element {
  const profileQuery = useProfile();
  const { data: profile } = profileQuery;
  const { data: performance } = usePerformance();
  const { data: streak } = useStreak({ enabled: !profileQuery.isError });
  const { data: points } = usePointsSummary();
  const { data: heatmap, isLoading: heatmapLoading } = useActivityHeatmap(182);
  const { data: domains, isLoading: domainsLoading } = useDomainPerformance();
  const { data: topics, isLoading: topicsLoading } = useTopicPerformance();
  const { data: difficulties, isLoading: difficultiesLoading } = useDifficultyPerformance();
  const { data: weakAreas, isLoading: weakLoading } = useWeakAreas();
  const { data: ratingHistory, isLoading: ratingLoading } = useRatingHistory();
  const { data: achievements, isLoading: achievementsLoading } = useAchievements();
  const { data: contributions } = useProfileContributions();
  const { data: competitive } = useProfileEvents();

  // A failed /profile/me (cold free-tier boot, expired session, transient
  // 500) previously rendered an endless skeleton because only `!profile`
  // was checked — no error branch existed. Surface an honest, retryable
  // error instead so a deployed hiccup never looks like a hung page.
  if (profileQuery.isError) {
    const message =
      profileQuery.error instanceof ApiError
        ? profileQuery.error.message
        : 'Could not load your profile.';
    const hint =
      profileQuery.error instanceof ApiError && profileQuery.error.kind === 'unauthorized'
        ? 'Your session may have expired. Sign in again, then retry.'
        : 'The server may be waking up (free-tier cold start). Wait a few seconds, then retry.';
    return (
      <div className="space-y-4">
        <ErrorState
          title="Could not load your profile"
          description={`${message} ${hint}`}
          onRetry={() => void profileQuery.refetch()}
        />
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading profile">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="animate-fade-up overflow-hidden" style={{ animationDelay: `${i * 70}ms` }} aria-hidden>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="skeleton-shine size-10 shrink-0 rounded-xl" />
              <div className="space-y-1.5">
                <div className="skeleton-shine h-5 w-14 rounded-md" />
                <div className="skeleton-shine h-3 w-20 rounded-md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const approved = contributions?.counts.APPROVED ?? 0;

  return (
    <div className="space-y-6">
      <ProfileHeader profile={profile} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={ListChecks}
          label="Solved"
          value={String(performance?.distinctSolved ?? 0)}
          index={0}
        />
        <StatCard
          icon={Target}
          label="Accuracy"
          value={
            performance?.accuracy === null || performance?.accuracy === undefined
              ? '—'
              : `${performance.accuracy}%`
          }
          index={1}
        />
        <StatCard icon={Flame} label="Day streak" value={String(streak?.current ?? 0)} index={2} />
        <StatCard icon={Coins} label="Points" value={String(points?.total ?? 0)} index={3} />
      </div>
      <ProblemAnalytics
        overall={performance}
        difficulties={difficulties?.items}
        isLoading={difficultiesLoading && !performance}
      />
      <CompetitiveRatings />
      <RatingChart points={ratingHistory?.items} isLoading={ratingLoading} />
      <ActivityHeatmap days={heatmap?.items} isLoading={heatmapLoading} />
      <DomainPerformance items={domains?.items} isLoading={domainsLoading} />
      <div className="grid gap-6 lg:grid-cols-2">
        <DifficultyPerformance items={difficulties?.items} isLoading={difficultiesLoading} />
        <WeakAreas items={weakAreas?.items} isLoading={weakLoading} />
      </div>
      <TopicPerformance items={topics?.items} isLoading={topicsLoading} />
      <PerformanceCoach />
      <AchievementsGrid items={achievements?.items} isLoading={achievementsLoading} />
      <div className="grid gap-6 lg:grid-cols-2">
        <RecentActivityFeed />
        <RecentPractice />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="card-lift card-shine relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-success/10 to-transparent" aria-hidden />
          <CardContent className="relative space-y-2 p-6">
            <p className="text-card-title font-semibold">Contributions</p>
            <p className="font-metric text-2xl font-bold">{approved}</p>
            <p className="text-sm text-muted-foreground">approved questions</p>
          </CardContent>
        </Card>
        <Card className="card-lift card-shine relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" aria-hidden />
          <CardContent className="relative space-y-2 p-6">
            <p className="text-card-title font-semibold">Events & contests</p>
            <p className="gradient-text-cool font-metric text-2xl font-extrabold">
              {(competitive?.events.length ?? 0) + (competitive?.contests.length ?? 0)}
            </p>
            <p className="text-sm text-muted-foreground">participations</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
