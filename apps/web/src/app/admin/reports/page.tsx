'use client';

import { useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@apteez/ui';
import { ApiError } from '@/lib/api-client';
import { useAdminAccess, useAdminReports, useResolveReport } from '@/hooks/use-admin';

const STATUS_TONE: Record<string, 'warning' | 'success' | 'secondary' | 'outline'> = {
  OPEN: 'warning',
  UNDER_REVIEW: 'outline',
  RESOLVED: 'success',
  DISMISSED: 'secondary',
};

export default function AdminReportsPage(): React.JSX.Element {
  const { allowed, isLoading: accessLoading } = useAdminAccess([
    'moderate:discussions',
    'view:analytics',
  ]);
  const [status, setStatus] = useState<string>('OPEN');
  const [targetType, setTargetType] = useState<string>('any');
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const { data, isLoading, isError, refetch } = useAdminReports(
    {
      status: status === 'any' ? undefined : status,
      targetType: targetType === 'any' ? undefined : targetType,
      page,
    },
    allowed,
  );
  const resolve = useResolveReport();

  if (accessLoading || isLoading) {
    return <LoadingState title="Loading reports…" />;
  }
  if (!allowed) {
    return (
      <EmptyState
        title="No access"
        description="Report triage needs moderation or analytics permission."
      />
    );
  }
  if (isError || !data) {
    return <ErrorState description="Could not load reports." onRetry={() => void refetch()} />;
  }

  const onResolve = (id: string, next: 'RESOLVED' | 'DISMISSED' | 'UNDER_REVIEW'): void => {
    resolve.mutate(
      { id, body: { status: next, resolution: resolution.trim() || undefined } },
      {
        onSuccess: () => {
          toast.success(`Report ${next.toLowerCase().replace(/_/g, ' ')}.`);
          setResolving(null);
          setResolution('');
          void refetch();
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : 'Action failed.'),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
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
            <SelectItem value="UNDER_REVIEW">Under review</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="DISMISSED">Dismissed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={targetType}
          onValueChange={(value) => {
            setTargetType(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48" aria-label="Target filter">
            <SelectValue placeholder="Target" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any target</SelectItem>
            <SelectItem value="PROBLEM">Problem</SelectItem>
            <SelectItem value="CONTRIBUTION">Contribution</SelectItem>
            <SelectItem value="DISCUSSION_POST">Discussion</SelectItem>
            <SelectItem value="DISCUSSION_REPLY">Reply</SelectItem>
            <SelectItem value="EVENT">Event</SelectItem>
            <SelectItem value="CONTEST">Contest</SelectItem>
            <SelectItem value="USER">User</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.items.length === 0 ? (
        <EmptyState title="Queue is clear" description="No reports match this filter." />
      ) : (
        <div className="space-y-3">
          {data.items.map((row) => (
            <div key={row.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_TONE[row.status] ?? 'secondary'}>
                  {row.status.replace(/_/g, ' ')}
                </Badge>
                <Badge variant="outline">{row.targetType.replace(/_/g, ' ')}</Badge>
                <Badge variant="outline">{row.priority}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold">{row.reason}</p>
              {row.targetTitle ? (
                <p className="text-xs text-muted-foreground">Target: {row.targetTitle}</p>
              ) : null}
              {row.description ? (
                <p className="mt-1 whitespace-pre-line text-sm">{row.description}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                Reporter: {row.reporter.displayName}
                {row.assignedModerator ? ` · Assignee: ${row.assignedModerator.displayName}` : ''}
                {row.resolution ? ` · Resolution: ${row.resolution}` : ''}
              </p>
              {(row.status === 'OPEN' || row.status === 'UNDER_REVIEW') && (
                <Dialog
                  open={resolving === row.id}
                  onOpenChange={(open) => {
                    if (!open) {
                      setResolving(null);
                      setResolution('');
                    }
                  }}
                >
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onResolve(row.id, 'UNDER_REVIEW')}
                    >
                      Take up
                    </Button>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => setResolving(row.id)}>
                        Resolve…
                      </Button>
                    </DialogTrigger>
                  </div>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Resolve report</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="report-resolution">Resolution (shown to reporter)</Label>
                        <Textarea
                          id="report-resolution"
                          value={resolution}
                          onChange={(event) => setResolution(event.target.value)}
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          disabled={resolve.isPending}
                          onClick={() => onResolve(row.id, 'RESOLVED')}
                        >
                          Resolve
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          disabled={resolve.isPending}
                          onClick={() => onResolve(row.id, 'DISMISSED')}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          ))}
        </div>
      )}

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
