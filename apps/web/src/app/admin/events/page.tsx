'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, EmptyState, ErrorState, LoadingState, SearchInput } from '@apteez/ui';
import type { EventSummaryDto } from '@apteez/types';
import { ApiError, apiFetch } from '@/lib/api-client';
import { useAdminAccess } from '@/hooks/use-admin';

function useAdminEvents(q: string, enabled: boolean) {
  const params = new URLSearchParams({ page: '1', pageSize: '20' });
  if (q) {
    params.set('q', q);
  }
  return useQuery({
    queryKey: ['admin', 'events', q],
    queryFn: () =>
      apiFetch<{
        items: EventSummaryDto[];
        meta: { page: number; pageSize: number; total: number; totalPages: number };
      }>(`/admin/events?${params.toString()}`),
    enabled,
  });
}

function useTransitionEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) =>
      apiFetch<unknown>(`/admin/events/${id}/transitions`, { method: 'POST', body: { to } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'events'] });
    },
  });
}

export default function AdminEventsPage(): React.JSX.Element {
  const { allowed, isLoading: accessLoading } = useAdminAccess(['manage:events']);
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { data, isLoading, isError, refetch } = useAdminEvents(submitted, allowed);
  const transition = useTransitionEvent();

  if (accessLoading || isLoading) {
    return <LoadingState title="Loading events…" />;
  }
  if (!allowed) {
    return <EmptyState title="No access" description="Event operations need manage:events." />;
  }
  if (isError || !data) {
    return <ErrorState description="Could not load events." onRetry={() => void refetch()} />;
  }

  const act = (id: string, to: string, title: string, verb: string): void => {
    if (!window.confirm(`${verb} "${title}"?`)) {
      return;
    }
    transition.mutate(
      { id, to },
      {
        onSuccess: () => {
          toast.success(`Event ${verb.toLowerCase()}d.`);
          void refetch();
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : 'Action failed.'),
      },
    );
  };

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <SearchInput
          label="Search events"
          placeholder="Title or organizer…"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <Button type="submit">Search</Button>
        <Button type="button" variant="default" asChild>
          <Link href="/events/create">Create event</Link>
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Member-hosted drafts land here for review — publish the good ones, cancel the rest.
      </p>

      {data.items.length === 0 ? (
        <EmptyState title="No events found" description="Adjust the search." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Origin</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Visibility</th>
                <th className="px-3 py-2 font-medium">Participants</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="max-w-xs px-3 py-2">
                    <span className="block truncate font-medium">{row.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.organizer.displayName}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.isOfficial ? <Badge variant="default">Official</Badge> : null}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        row.status === 'LIVE'
                          ? 'success'
                          : row.status === 'CANCELLED'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {row.status.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.visibility}</td>
                  <td className="px-3 py-2 font-metric">{row.participantCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/events/${row.slug}`}>Open</Link>
                      </Button>
                      {row.status !== 'CANCELLED' &&
                      row.status !== 'COMPLETED' &&
                      row.status !== 'ARCHIVED' ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => act(row.id, 'CANCELLED', row.title, 'Cancel')}
                        >
                          Cancel
                        </Button>
                      ) : null}
                      {row.status === 'COMPLETED' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => act(row.id, 'ARCHIVED', row.title, 'Archive')}
                        >
                          Archive
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Cancellations notify participants and are recorded in the event audit trail.
      </p>
    </div>
  );
}
