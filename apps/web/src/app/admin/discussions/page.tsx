'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@apteez/ui';
import { ApiError } from '@/lib/api-client';
import {
  useAdminAccess,
  useDiscussionReports,
  useFlaggedThreads,
  useModerationAction,
} from '@/hooks/use-admin';

export default function AdminDiscussionsPage(): React.JSX.Element {
  const { allowed, isLoading: accessLoading } = useAdminAccess(['moderate:discussions']);
  const [tab, setTab] = useState('reports');
  const [status, setStatus] = useState<string>('OPEN');
  const [page, setPage] = useState(1);
  const reports = useDiscussionReports(
    status === 'any' ? undefined : status,
    page,
    allowed && tab === 'reports',
  );
  const moderate = useModerationAction();

  if (accessLoading) {
    return <LoadingState title="Loading moderation…" />;
  }
  if (!allowed) {
    return (
      <EmptyState
        title="No access"
        description="Discussion moderation needs moderate:discussions."
      />
    );
  }

  const act = (path: string, body?: Record<string, unknown>): void => {
    moderate.mutate(
      { path, body },
      {
        onSuccess: () => toast.success('Moderation action recorded.'),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : 'Action failed.'),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="flagged">Flagged threads</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'reports' ? (
        <div className="space-y-4">
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44" aria-label="Status filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="REVIEWING">Reviewing</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
              <SelectItem value="DISMISSED">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          {reports.isLoading ? (
            <LoadingState title="Loading reports…" />
          ) : reports.isError || !reports.data ? (
            <ErrorState description="Could not load reports." />
          ) : reports.data.items.length === 0 ? (
            <EmptyState title="No reports" description="Nothing waiting for review." />
          ) : (
            <div className="space-y-3">
              {reports.data.items.map((row) => (
                <div key={row.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={row.status === 'OPEN' ? 'warning' : 'secondary'}>
                      {row.status}
                    </Badge>
                    <Badge variant="outline">{row.reason}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">
                    {row.targetTitle ??
                      (row.postId ? `Post ${row.postId}` : `Reply ${row.replyId}`)}
                  </p>
                  {row.detail ? (
                    <p className="mt-1 text-sm text-muted-foreground">{row.detail}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reporter: {row.reporter.displayName}
                  </p>
                  {row.status === 'OPEN' || row.status === 'REVIEWING' ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          act(`/admin/discussions/reports/${row.id}/status`, {
                            status: 'REVIEWING',
                          })
                        }
                      >
                        Take up
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          act(`/admin/discussions/reports/${row.id}/status`, { status: 'RESOLVED' })
                        }
                      >
                        Resolve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          act(`/admin/discussions/reports/${row.id}/status`, {
                            status: 'DISMISSED',
                          })
                        }
                      >
                        Dismiss
                      </Button>
                      {row.postId ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              act(`/admin/discussions/posts/${row.postId}/hide`, {
                                reason: `Report ${row.id}`,
                              })
                            }
                          >
                            Hide post
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => act(`/admin/discussions/posts/${row.postId}/lock`)}
                          >
                            Lock
                          </Button>
                        </>
                      ) : null}
                      {row.replyId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            act(`/admin/discussions/replies/${row.replyId}/hide`, {
                              reason: `Report ${row.id}`,
                            })
                          }
                        >
                          Hide reply
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <FlaggedThreads />
      )}
    </div>
  );
}

function FlaggedThreads(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useFlaggedThreads(page, true);
  const moderate = useModerationAction();
  if (isLoading) {
    return <LoadingState title="Loading flagged threads…" />;
  }
  if (isError || !data) {
    return <ErrorState description="Could not load flagged threads." />;
  }
  if (data.items.length === 0) {
    return (
      <EmptyState title="Nothing flagged" description="Threads with open reports appear here." />
    );
  }
  return (
    <div className="space-y-3">
      {data.items.map((row) => (
        <div key={row.id} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{row.title}</span>
            {row.hidden ? <Badge variant="destructive">Hidden</Badge> : null}
            {row.locked ? <Badge variant="outline">Locked</Badge> : null}
            <Badge variant="warning">{row.openReports} open reports</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.author.displayName} · <span className="font-metric">{row.replyCount}</span> replies
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {row.hidden ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  moderate.mutate(
                    { path: `/admin/discussions/posts/${row.id}/restore` },
                    {
                      onError: (error) =>
                        toast.error(error instanceof ApiError ? error.message : 'Restore failed.'),
                    },
                  )
                }
              >
                Restore
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  moderate.mutate(
                    {
                      path: `/admin/discussions/posts/${row.id}/hide`,
                      body: { reason: 'Flagged thread review' },
                    },
                    {
                      onError: (error) =>
                        toast.error(error instanceof ApiError ? error.message : 'Hide failed.'),
                    },
                  )
                }
              >
                Hide
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                moderate.mutate(
                  { path: `/admin/discussions/posts/${row.id}/${row.locked ? 'unlock' : 'lock'}` },
                  {
                    onError: (error) =>
                      toast.error(error instanceof ApiError ? error.message : 'Action failed.'),
                  },
                )
              }
            >
              {row.locked ? 'Unlock' : 'Lock'}
            </Button>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Page <span className="font-metric">{data.page}</span> of{' '}
          <span className="font-metric">{data.totalPages}</span>
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Prev
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
