'use client';

import { Coins, Flame, ListChecks, Target } from 'lucide-react';
import { Card, CardContent } from '@apteez/ui';
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

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
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
  const { data: profile } = useProfile();
  const { data: performance } = usePerformance();
  const { data: streak } = useStreak();
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

  if (!profile) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={ListChecks} label="Solved" value="—" />
        <StatCard icon={Target} label="Accuracy" value="—" />
        <StatCard icon={Flame} label="Day streak" value="—" />
        <StatCard icon={Coins} label="Points" value="—" />
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
        />
        <StatCard
          icon={Target}
          label="Accuracy"
          value={
            performance?.accuracy === null || performance?.accuracy === undefined
              ? '—'
              : `${performance.accuracy}%`
          }
        />
        <StatCard icon={Flame} label="Day streak" value={String(streak?.current ?? 0)} />
        <StatCard icon={Coins} label="Points" value={String(points?.total ?? 0)} />
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
        <Card>
          <CardContent className="space-y-2 p-6">
            <p className="text-card-title font-semibold">Contributions</p>
            <p className="font-metric text-2xl font-bold">{approved}</p>
            <p className="text-sm text-muted-foreground">approved questions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-6">
            <p className="text-card-title font-semibold">Events & contests</p>
            <p className="font-metric text-2xl font-bold">
              {(competitive?.events.length ?? 0) + (competitive?.contests.length ?? 0)}
            </p>
            <p className="text-sm text-muted-foreground">participations</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
