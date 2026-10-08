'use client';

import { useParams } from 'next/navigation';
import { ListChecks, Medal, Target } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@apteez/ui';
import { PageHeader } from '@/components/shared/page-header';
import { AchievementsGrid } from '@/components/profile/achievements-grid';
import { ActivityHeatmap } from '@/components/profile/activity-heatmap';
import { usePublicProfile } from '@/hooks/use-profile';
import { ApiError, apiFetch } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import type { ActivityDayDto } from '@apteez/types';

export default function PublicProfilePage(): React.JSX.Element {
  const params = useParams<{ username: string }>();
  const username = params?.username;
  const { data: profile, isLoading, isError, error } = usePublicProfile(username);
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['users', username, 'overview'],
    queryFn: () =>
      apiFetch<{ profile: unknown; activity: ActivityDayDto[] }>(`/users/${username}/overview`),
    enabled: Boolean(username) && !isError,
    staleTime: 60_000,
    retry: false,
  });

  const initial = (profile?.displayName ?? 'A').trim().charAt(0).toUpperCase() || 'A';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Public arena identity"
        title={username ? `@${username}` : 'Profile'}
        description="Competitive identity — public to everyone unless the owner set it private."
      />
      {isLoading ? (
        <Card className="animate-fade-in overflow-hidden" aria-busy="true" aria-label="Loading profile">
          <div className="loading-rail h-1" aria-hidden>
            <span />
          </div>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <div className="skeleton-shine size-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton-shine h-6 w-48 rounded-lg" />
              <div className="skeleton-shine h-4 w-64 max-w-full rounded-md" />
            </div>
          </CardContent>
        </Card>
      ) : isError || !profile ? (
        <Card className="animate-fade-in border-destructive/30">
          <CardContent className="p-6 text-sm text-muted-foreground">
            {error instanceof ApiError ? error.message : 'Profile not found.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="page-enter-1 overflow-hidden">
            <span className="block h-1.5 bg-gradient-to-r from-primary via-accent-foreground to-primary" aria-hidden />
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
              <span className="rounded-full bg-gradient-to-br from-primary to-accent-foreground p-[3px] shadow-lg shadow-primary/30" aria-hidden>
                <Avatar className="size-16 border-2 border-card">
                  {profile.avatarUrl ? (
                    <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
                  ) : null}
                  <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/60 text-xl font-extrabold text-primary">
                    {initial}
                  </AvatarFallback>
                </Avatar>
              </span>
              <div className="min-w-0 flex-1">
                <CardTitle className="gradient-text text-2xl font-extrabold">{profile.displayName}</CardTitle>
                <CardDescription className="mt-1">
                  @{profile.username}
                  {profile.institution ? ` · ${profile.institution}` : ''}
                  {profile.country ? ` · ${profile.country}` : ''}
                </CardDescription>
                {profile.bio ? (
                  <p className="mt-2 text-sm text-muted-foreground">{profile.bio}</p>
                ) : null}
              </div>
              {profile.tier ? <Badge variant="outline">{profile.tier}</Badge> : null}
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-3">
            {[
              { icon: ListChecks, label: 'Solved', value: String(profile.solvedCount) },
              {
                icon: Target,
                label: 'Accuracy',
                value: profile.accuracy === null ? '—' : `${profile.accuracy}%`,
              },
              {
                icon: Medal,
                label: 'Best rating',
                value: profile.bestRating === null ? '—' : String(profile.bestRating),
              },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground min-[500px]:flex">
                    <stat.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-metric text-lg font-bold leading-none">
                      {stat.value}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {stat.label}
                    </span>
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
          <ActivityHeatmap days={activity?.activity} isLoading={activityLoading} />
          <AchievementsGrid items={profile.achievements} isLoading={isLoading} />
        </>
      )}
    </div>
  );
}
