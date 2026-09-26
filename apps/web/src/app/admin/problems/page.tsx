'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@apteez/ui';
import { ApiError } from '@/lib/api-client';
import {
  useAdminAccess,
  useAdminProblemAction,
  useAdminProblems,
  useDeleteProblem,
  useUpdateProblem,
} from '@/hooks/use-admin';
import { NewProblemDialog } from '@/components/admin/new-problem-dialog';

const STATUS_TONE: Record<
  string,
  'success' | 'warning' | 'destructive' | 'secondary' | 'outline' | 'default'
> = {
  PUBLISHED: 'success',
  DRAFT: 'secondary',
  PENDING_REVIEW: 'warning',
  ARCHIVED: 'outline',
  REJECTED: 'destructive',
};

export default function AdminProblemsPage(): React.JSX.Element {
  const { allowed, isLoading: accessLoading } = useAdminAccess(['manage:questions']);
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [status, setStatus] = useState<string>('any');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useAdminProblems(
    { q: submitted || undefined, status: status === 'any' ? undefined : status, page },
    allowed,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const update = useUpdateProblem(editing ?? '');
  const publish = useAdminProblemAction(editing ?? '', 'publish');
  const archive = useAdminProblemAction(editing ?? '', 'archive');
  const restore = useAdminProblemAction(editing ?? '', 'restore');
  const destroy = useDeleteProblem();

  if (accessLoading || isLoading) {
    return <LoadingState title="Loading problems…" />;
  }
  if (!allowed) {
    return (
      <EmptyState
        title="No content access"
        description="Your staff account lacks manage:questions."
      />
    );
  }
  if (isError || !data) {
    return <ErrorState description="Could not load problems." onRetry={() => void refetch()} />;
  }

  const act = (
    action: 'publish' | 'archive' | 'restore',
    id: string,
    title: string,
    verb: string,
  ): void => {
    if (!window.confirm(`${verb} "${title}"?`)) {
      return;
    }
    const mutation = action === 'publish' ? publish : action === 'archive' ? archive : restore;
    setEditing(id);
    mutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Problem ${verb.toLowerCase()}d.`);
        setEditing(null);
        void refetch();
      },
      onError: (error) => {
        toast.error(error instanceof ApiError ? error.message : 'Action failed.');
        setEditing(null);
      },
    });
  };

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSubmitted(q.trim());
        }}
      >
        <SearchInput
          label="Search problems"
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
            <SelectItem value="PENDING_REVIEW">Pending review</SelectItem>
            <SelectItem value="PUBLISHED">Published</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit">Search</Button>
        <Button type="button" variant="default" onClick={() => setCreating(true)}>
          New problem
        </Button>
      </form>
      <NewProblemDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => void refetch()}
      />

      {data.items.length === 0 ? (
        <EmptyState title="No problems found" description="Adjust the search or filters." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Exams</th>
                <th className="px-3 py-2 font-medium">Attempts</th>
                <th className="px-3 py-2 font-medium">Accuracy</th>
                <th className="px-3 py-2 font-medium">Reports</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="max-w-xs px-3 py-2">
                    <span className="block truncate font-medium">{row.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.category} · {row.topic ?? 'General'} · {row.difficulty} ·{' '}
                      <span className="font-metric">{row.rating}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_TONE[row.status] ?? 'secondary'}>
                      {row.status.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="max-w-48 px-3 py-2">
                    {row.examTags.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No folders</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {row.examTags.map((slug) => (
                          <Badge key={slug} variant="outline" className="text-xs">
                            {slug}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-metric">{row.attempts}</td>
                  <td className="px-3 py-2 font-metric">
                    {row.accuracy === null ? '—' : `${row.accuracy}%`}
                  </td>
                  <td className="px-3 py-2 font-metric">{row.reports}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.status !== 'PUBLISHED' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => act('publish', row.id, row.title, 'Publish')}
                        >
                          Publish
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => act('archive', row.id, row.title, 'Archive')}
                        >
                          Archive
                        </Button>
                      )}
                      {row.status === 'ARCHIVED' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => act('restore', row.id, row.title, 'Restore')}
                        >
                          Restore
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const next = window.prompt(
                            'Exam folders (comma-separated slugs, empty clears):',
                            row.examTags.join(', '),
                          );
                          if (next === null) {
                            return;
                          }
                          const examTagSlugs = next
                            .split(',')
                            .map((part) => part.trim())
                            .filter((part) => part.length > 0);
                          setEditing(row.id);
                          update.mutate(
                            { examTagSlugs },
                            {
                              onSuccess: () => {
                                toast.success('Exam folders updated.');
                                setEditing(null);
                                void refetch();
                              },
                              onError: (error) => {
                                toast.error(
                                  error instanceof ApiError ? error.message : 'Update failed.',
                                );
                                setEditing(null);
                              },
                            },
                          );
                        }}
                      >
                        Exams
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const next = window.prompt(
                            'Set rating (1000–2000, whole hundreds):',
                            String(row.rating),
                          );
                          if (next === null) {
                            return;
                          }
                          const value = Math.min(
                            2000,
                            Math.max(1000, Math.round(Number(next) / 100) * 100),
                          );
                          if (!Number.isFinite(value)) {
                            return;
                          }
                          setEditing(row.id);
                          update.mutate(
                            { rating: value },
                            {
                              onSuccess: () => {
                                toast.success('Rating updated.');
                                setEditing(null);
                                void refetch();
                              },
                              onError: (error) => {
                                toast.error(
                                  error instanceof ApiError ? error.message : 'Update failed.',
                                );
                                setEditing(null);
                              },
                            },
                          );
                        }}
                      >
                        Rating
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={destroy.isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Permanently delete "${row.title}"? This cannot be undone.`,
                            )
                          ) {
                            return;
                          }
                          destroy.mutate(row.id, {
                            onSuccess: () => {
                              toast.success('Problem deleted.');
                              void refetch();
                            },
                            onError: (error) => {
                              toast.error(
                                error instanceof ApiError ? error.message : 'Delete failed.',
                              );
                            },
                          });
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Archiving hides without deleting history. Delete is permanent and refused while submissions,
        favorites, or live contest slots reference the problem.
      </p>
    </div>
  );
}
