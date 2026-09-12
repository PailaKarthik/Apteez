'use client';

import { Bookmark, Flame, ListChecks, Medal } from 'lucide-react';
import Link from 'next/link';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';
import { CompetitiveRatings } from './competitive-ratings';
import { RecentPractice } from './recent-practice';

export function ProfileContent(): React.JSX.Element {
  const { user } = useAuth();
  const initial = (user?.displayName ?? 'A').trim().charAt(0).toUpperCase() || 'A';

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <Avatar className="size-16">
            <AvatarFallback className="text-xl">{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl">{user?.displayName}</CardTitle>
              {user?.roles.includes('admin') || user?.roles.includes('super_admin') ? (
                <Badge variant="secondary">Admin</Badge>
              ) : null}
            </div>
            <CardDescription className="mt-1">
              @{user?.username} · {user?.email}
              {user?.institution ? ` · ${user.institution}` : ''}
              {user?.country ? ` · ${user.country}` : ''}
            </CardDescription>
          </div>
          <Button variant="outline" asChild>
            <Link href="/contribute">Contribute a question</Link>
          </Button>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: ListChecks, label: 'Solved', value: '0' },
          { icon: Flame, label: 'Day streak', value: '0' },
          { icon: Medal, label: 'Best rank', value: '—' },
          { icon: Bookmark, label: 'Favorites', value: '0' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <stat.icon className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-lg font-bold leading-none text-foreground">
                  {stat.value}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{stat.label}</span>
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
      <CompetitiveRatings />
      <RecentPractice />
    </div>
  );
}
