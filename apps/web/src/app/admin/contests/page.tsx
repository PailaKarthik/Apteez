'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@apteez/ui';
import { ApiError } from '@/lib/api-client';
import {
  useAdminAccess,
  useAdminContests,
  useCancelContest,
  useContestParticipants,
} from '@/hooks/use-admin';

export default function AdminContestsPage(): React.JSX.Element {
  const { allowed, isLoading: accessLoading } = useAdminAccess(['manage:contests']);
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [status, setStatus] = useState<string>('any');
  const [page, setPage] = useState(1);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const { data, isLoading, isError, refetch } = useAdminContests(
    { q: submitted || undefined, status: status === 'any' ? undefined : status, page },
    allowed,
  );
  const cancel = useCancelContest(cancelling ?? '');

  if (accessLoading || isLoading) {
    return <LoadingState title="Loading contests…" />;
  }
  if (!allowed) {
    return <EmptyState title="No access" description="Contest operations need manage:contests." />;
  }
  if (isError || !data) {
    return <ErrorState description="Could not load contests." onRetry={() => void refetch()} />;
  }

  const onCancel = (): void => {
    if (!cancelling || reason.trim().length < 5) {
      return;
    }
    cancel.mutate(
      { reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success('Contest cancelled. Participants were notified.');
          setCancelling(null);
          setReason('');
          void refetch();
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : 'Cancel failed.'),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button asChild>
          <Link href="/contests/new">New contest</Link>
        </Button>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSubmitted(q.trim());
        }}
      >
        <SearchInput
          label="Search contests"
          placeholder="Title…"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48" aria-label="Status filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="PUBLISHED">Published</SelectItem>
            <SelectItem value="REGISTRATION_OPEN">Registration open</SelectItem>
            <SelectItem value="LIVE">Live</SelectItem>
            <SelectItem value="ENDED">Ended</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit">Search</Button>
      </form>

      {data.items.length === 0 ? (
        <EmptyState title="No contests found" description="Adjust the search or filters." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Contest</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Participants</th>
                <th className="px-3 py-2 font-medium">Starts</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="max-w-xs px-3 py-2">
                    <span className="block truncate font-medium">{row.title}</span>
                    <span className="block font-metric text-xs text-muted-foreground">
                      {row.questionCount} questions
                    </span>
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
                  <td className="px-3 py-2 font-metric">{row.participantCount}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(row.startsAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInspecting(inspecting === row.id ? null : row.id)}
                      >
                        {inspecting === row.id ? 'Close' : 'Inspect'}
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/contests/${row.id}`}>Open</Link>
                      </Button>
                      {row.status !== 'CANCELLED' &&
                      row.status !== 'ENDED' &&
                      row.status !== 'ARCHIVED' ? (
                        <Dialog
                          open={cancelling === row.id}
                          onOpenChange={(open) => {
                            if (!open) {
                              setCancelling(null);
                              setReason('');
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setCancelling(row.id)}
                            >
                              Cancel
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Cancel “{row.title}”?</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                              <p className="text-sm text-muted-foreground">
                                {row.participantCount} participants will be notified. Rankings
                                already finalized stay untouched.
                              </p>
                              <div className="space-y-1.5">
                                <Label htmlFor="cancel-reason">Reason (required)</Label>
                                <Textarea
                                  id="cancel-reason"
                                  value={reason}
                                  onChange={(event) => setReason(event.target.value)}
                                  rows={3}
                                />
                              </div>
                              <Button
                                className="w-full"
                                variant="destructive"
                                disabled={cancel.isPending || reason.trim().length < 5}
                                onClick={onCancel}
                              >
                                {cancel.isPending ? 'Cancelling…' : 'Confirm cancel'}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      ) : null}
                    </div>
                  </td>
                  </tr>
                  {/* Participants render as their own full-width row: nested
                      inside the Actions cell they stretched the scroll
                      container and pushed Actions off-screen on mobile. */}
                  {inspecting === row.id ? (
                    <tr className="border-b border-border bg-muted/20 last:border-0">
                      <td colSpan={5} className="px-3 py-2">
                        <Participants id={row.id} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Participants({ id }: { id: string }): React.JSX.Element {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useContestParticipants(id, page, true);
  if (isLoading || !data) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Loading participants…</p>;
  }
  if (data.items.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No participants yet.</p>;
  }
  return (
    <div className="px-3 py-2 text-xs">
      <ul className="space-y-1">
        {data.items.slice(0, 8).map((row) => (
          <li key={row.userId} className="flex justify-between gap-2 text-muted-foreground">
            <span>
              {row.displayName}
              {row.rank !== null ? ` · rank ${row.rank}` : ''}
            </span>
            <span>{row.status}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center gap-2 text-muted-foreground">
        <span>
          <span className="font-metric">{data.total}</span> total
        </span>
        {data.totalPages > 1 ? (
          <>
            <button
              type="button"
              className="underline"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Prev
            </button>
            <button
              type="button"
              className="underline"
              disabled={page >= data.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
