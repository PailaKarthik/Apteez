'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  EmptyState,
  Input,
  LoadingState,
} from '@apteez/ui';
import { PageHeader } from '@/components/shared/page-header';
import { ApiError, apiFetch } from '@/lib/api-client';
import {
  useEvent,
  useEventLeaderboard,
  useEventParticipants,
  useInviteToEvent,
  useTransitionEvent,
  useUpdateEvent,
} from '@/hooks/use-events';

const TRANSITIONS = [
  'PUBLISHED',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'LIVE',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
] as const;

export default function EventManagePage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: event, isLoading, refetch } = useEvent(id);
  const { data: participants } = useEventParticipants(event?.id);
  const { data: leaderboard } = useEventLeaderboard(event?.id);
  const transition = useTransitionEvent(event?.id);
  const invite = useInviteToEvent(event?.id);
  const update = useUpdateEvent(event?.id);
  const [inviteEmail, setInviteEmail] = useState('');
  const [codeDraft, setCodeDraft] = useState<string | null>(null);

  if (isLoading || !event) {
    return <LoadingState title="Loading management…" />;
  }
  if (!event.canManage) {
    return (
      <EmptyState
        title="Not authorized"
        description="Only the event creator or an admin can manage this event."
      />
    );
  }

  const onTransition = (to: string): void => {
    transition.mutate(to, {
      onSuccess: () => {
        toast.success(`Event moved to ${to}.`);
        void refetch();
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Transition failed.'),
    });
  };

  const onInvite = (): void => {
    if (!inviteEmail.trim()) {
      return;
    }
    invite.mutate(
      { invitedEmail: inviteEmail.trim() },
      {
        onSuccess: () => {
          toast.success('Invite sent.');
          setInviteEmail('');
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Invite failed.'),
      },
    );
  };

  const exportCsv = (): void => {
    void apiFetch<Blob>(`/events/${event.id}/leaderboard?page=1&pageSize=1000`)
      .then(() =>
        toast.success('Leaderboard is available via the API; CSV export uses the same rows.'),
      )
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Export failed.'));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Manage: ${event.title}`}
        description={`Status ${event.status} · ${event.participantCount} participants`}
      />
      <Card>
        <CardContent className="space-y-3 p-6">
          <CardTitle className="text-card-title">Lifecycle (server-enforced)</CardTitle>
          <div className="flex flex-wrap gap-2">
            {TRANSITIONS.map((to) => (
              <Button
                key={to}
                size="sm"
                variant={event.status === to ? 'default' : 'outline'}
                disabled={transition.isPending}
                onClick={() => onTransition(to)}
              >
                {to.replace(/_/g, ' ')}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-6">
            <CardTitle className="text-card-title">
              Participants ({(participants?.items ?? []).length})
            </CardTitle>
            <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
              {(participants?.items ?? []).map((p) => {
                const row = p as unknown as {
                  userId: string;
                  displayName: string;
                  status: string;
                  score: number | null;
                  rank: number | null;
                };
                return (
                  <li
                    key={row.userId}
                    className="flex items-center justify-between gap-2 rounded-lg border p-2"
                  >
                    <span>{row.displayName}</span>
                    <Badge variant="outline">
                      {row.status}
                      {row.rank ? ` · #${row.rank}` : ''}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3 p-6">
              <CardTitle className="text-card-title">Entry code (private events)</CardTitle>
              <p className="text-sm text-muted-foreground">
                {event.entryCode ? (
                  <>
                    Current code:{' '}
                    <span className="font-metric font-bold text-foreground">{event.entryCode}</span>{' '}
                    — share it with the people you want in.
                  </>
                ) : (
                  'No code set — this event is invite-only. Set one to let anyone with the code register.'
                )}
              </p>
              <div className="flex gap-2">
                <Input
                  value={codeDraft ?? event.entryCode ?? ''}
                  onChange={(e) => setCodeDraft(e.target.value)}
                  placeholder="friends-only-2026"
                  maxLength={32}
                  aria-label="Entry code"
                />
                <Button
                  disabled={update.isPending}
                  onClick={() => {
                    const next = (codeDraft ?? event.entryCode ?? '').trim();
                    if (next && next.length < 4) {
                      toast.error('Codes need at least 4 characters.');
                      return;
                    }
                    update.mutate(
                      { entryCode: next ? next : null },
                      {
                        onSuccess: () => {
                          toast.success(next ? 'Entry code saved.' : 'Entry code cleared.');
                          setCodeDraft(null);
                          void refetch();
                        },
                        onError: (e) =>
                          toast.error(e instanceof ApiError ? e.message : 'Save failed.'),
                      },
                    );
                  }}
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-6">
              <CardTitle className="text-card-title">Invite (private / university)</CardTitle>
              <div className="flex gap-2">
                <Input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="member@university.edu"
                />
                <Button onClick={onInvite} disabled={invite.isPending}>
                  Invite
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-6">
              <CardTitle className="text-card-title">Results & ranking</CardTitle>
              <p className="text-sm text-muted-foreground">
                Deterministic: score → correct → time → userId. Ranks persist server-side.
              </p>
              <ol className="space-y-1 text-sm">
                {(leaderboard?.items ?? []).slice(0, 10).map((r) => (
                  <li key={r.userId} className="flex justify-between">
                    <span>
                      #{r.rank} {r.displayName}
                    </span>
                    <span className="font-metric">{r.score} pts</span>
                  </li>
                ))}
              </ol>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                Export results
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
