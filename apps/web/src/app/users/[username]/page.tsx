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
        title={username ? `@${username}` : 'Profile'}
        description="Competitive identity — public to everyone unless the owner set it private."
      />
      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading profile…</CardContent>
        </Card>
      ) : isError || !profile ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {error instanceof ApiError ? error.message : 'Profile not found.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
              <Avatar className="size-16">
                {profile.avatarUrl ? (
                  <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
                ) : null}
                <AvatarFallback className="text-xl">{initial}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-xl">{profile.displayName}</CardTitle>
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
          <div className="grid grid-cols-3 gap-3">
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
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <stat.icon className="size-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-metric text-lg font-bold leading-none">
                      {stat.value}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{stat.label}</span>
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
