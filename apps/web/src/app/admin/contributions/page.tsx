'use client';

import Link from 'next/link';
import { useState } from 'react';
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
} from '@apteez/ui';
import { useAdminAccess, useAdminContributions } from '@/hooks/use-admin';

export default function AdminContributionsPage(): React.JSX.Element {
  const { allowed, isLoading: accessLoading } = useAdminAccess(['review:contributions']);
  const [status, setStatus] = useState<string>('queue');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useAdminContributions(
    status === 'queue' ? undefined : status,
    page,
    allowed,
  );

  if (accessLoading || isLoading) {
    return <LoadingState title="Loading contributions…" />;
  }
  if (!allowed) {
    return (
      <EmptyState
        title="No review access"
        description="Your staff account lacks review:contributions."
      />
    );
  }
  if (isError || !data) {
    return (
      <ErrorState description="Could not load the review queue." onRetry={() => void refetch()} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-52" aria-label="Status filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="queue">Needs review</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="UNDER_REVIEW">Under review</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.items.length === 0 ? (
        <EmptyState title="Queue is clear" description="No contributions match this filter." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Contributor</th>
                <th className="px-3 py-2 font-medium">Submitted</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="max-w-xs truncate px-3 py-2 font-medium">{row.title}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        row.status === 'APPROVED'
                          ? 'success'
                          : row.status === 'REJECTED'
                            ? 'destructive'
                            : 'warning'
                      }
                    >
                      {row.status.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {row.contributor.displayName}
                    {row.contributor.username ? ` (@${row.contributor.username})` : ''}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(row.submittedAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/contributions/${row.id}`}>Review</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
