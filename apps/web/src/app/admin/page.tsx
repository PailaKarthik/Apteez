'use client';

import dynamic from 'next/dynamic';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from '@apteez/ui';
import { useAdminAccess, useAdminOverview } from '@/hooks/use-admin';

const SnapshotChart = dynamic(
  async () => {
    const recharts = await import('recharts');
    return function SnapshotBars({ data }: { data: Array<{ name: string; value: number }> }) {
      return (
        <recharts.ResponsiveContainer width="100%" height={220}>
          <recharts.BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <recharts.XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-18}
              dy={10}
              height={52}
            />
            <recharts.YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
            />
            <recharts.Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
            <recharts.Bar
              dataKey="value"
              name="Count"
              fill="hsl(var(--primary))"
              radius={[6, 6, 0, 0]}
            />
          </recharts.BarChart>
        </recharts.ResponsiveContainer>
      );
    };
  },
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" /> },
);

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="font-metric text-2xl font-bold">{value}</p>
        <p className="text-xs font-medium">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default function AdminOverviewPage(): React.JSX.Element {
  const { allowed, isLoading: accessLoading } = useAdminAccess(['view:analytics']);
  const { data, isLoading, isError, refetch } = useAdminOverview(allowed);

  if (accessLoading || isLoading) {
    return <LoadingState title="Loading overview…" />;
  }
  if (!allowed) {
    return (
      <EmptyState
        title="No analytics access"
        description="Your staff account lacks the analytics permission."
      />
    );
  }
  if (isError || !data) {
    return (
      <ErrorState description="Could not load platform metrics." onRetry={() => void refetch()} />
    );
  }

  const chart = [
    { name: 'Users', value: data.users.total },
    { name: 'Problems', value: data.content.publishedProblems },
    { name: 'Pending contrib.', value: data.content.pendingContributions },
    { name: 'Open reports', value: data.community.openReports },
    { name: 'Active rewards', value: data.rewards.activeRewards },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total users"
          value={String(data.users.total)}
          hint={`${data.users.new7d} new in 7d`}
        />
        <StatCard
          label="Active users"
          value={String(data.users.active)}
          hint={`${data.users.suspended} suspended`}
        />
        <StatCard
          label="Published problems"
          value={String(data.content.publishedProblems)}
          hint={`${data.content.pendingContributions} contributions pending`}
        />
        <StatCard
          label="Live contests"
          value={String(data.competition.liveContests)}
          hint={`${data.competition.upcomingContests} upcoming`}
        />
        <StatCard
          label="Live events"
          value={String(data.competition.liveEvents)}
          hint={`${data.competition.upcomingEvents} upcoming`}
        />
        <StatCard
          label="Open reports"
          value={String(data.community.openReports)}
          hint={`${data.community.openDiscussionReports} discussion reports`}
        />
        <StatCard
          label="Pending redemptions"
          value={String(data.rewards.pendingRedemptions)}
          hint={`${data.rewards.activeRewards} active rewards`}
        />
        <StatCard
          label="Points earned today"
          value={String(data.rewards.pointsEarnedToday)}
          hint="UTC day"
        />
      </div>
      <Card>
        <CardContent className="space-y-2 p-6">
          <CardTitle className="text-card-title">Platform snapshot</CardTitle>
          <CardDescription>Counts from PostgreSQL, cached for 60 seconds.</CardDescription>
          <SnapshotChart data={chart} />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Generated at {new Date(data.generatedAt).toLocaleString()}.
      </p>
    </div>
  );
}
