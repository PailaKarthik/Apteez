'use client';

import { useState } from 'react';
import { Button, EmptyState, ErrorState, Input, LoadingState } from '@apteez/ui';
import { useAdminAccess, useAdminAuditLogs } from '@/hooks/use-admin';

export default function AdminAuditLogsPage(): React.JSX.Element {
  const { allowed, isLoading: accessLoading } = useAdminAccess(['view:analytics']);
  const [action, setAction] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [targetType, setTargetType] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useAdminAuditLogs(
    {
      action: submitted || undefined,
      targetType: targetType.trim() || undefined,
      page,
    },
    allowed,
  );

  if (accessLoading || isLoading) {
    return <LoadingState title="Loading audit logs…" />;
  }
  if (!allowed) {
    return <EmptyState title="No access" description="Audit reads need view:analytics." />;
  }
  if (isError || !data) {
    return <ErrorState description="Could not load audit logs." onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSubmitted(action.trim());
        }}
      >
        <Input
          aria-label="Action filter"
          placeholder="Action contains… e.g. contribution.approve"
          value={action}
          onChange={(event) => setAction(event.target.value)}
        />
        <Input
          aria-label="Target type filter"
          placeholder="Target type… e.g. USER"
          value={targetType}
          onChange={(event) => {
            setTargetType(event.target.value);
            setPage(1);
          }}
          className="sm:w-48"
        />
        <Button type="submit">Filter</Button>
      </form>

      {data.items.length === 0 ? (
        <EmptyState
          title="No audit entries"
          description="Sensitive admin actions are recorded here."
        />
      ) : (
        <div className="space-y-2">
          {data.items.map((row) => (
            <div key={row.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-metric font-semibold">{row.action}</span>
                <span className="text-xs text-muted-foreground">
                  by {row.actor.displayName}
                  {row.actor.username ? ` (@${row.actor.username})` : ''}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.targetType
                  ? `${row.targetType}${row.targetId ? ` ${row.targetId.slice(0, 8)}…` : ''} · `
                  : ''}
                {row.reason ?? 'no reason recorded'}
                {row.ip ? ` · ${row.ip}` : ''}
              </p>
              {(row.previousValue !== null || row.newValue !== null) && (
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Value change</summary>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-muted p-2 font-metric text-[11px]">
                    {JSON.stringify({ before: row.previousValue, after: row.newValue }, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Page <span className="font-metric">{data.page}</span> of{' '}
          <span className="font-metric">{data.totalPages}</span>
          {' · '}
          <span className="font-metric">{data.total}</span> entries
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
      <p className="text-xs text-muted-foreground">
        Audit rows are append-only — no edit or delete endpoint exists.
      </p>
    </div>
  );
}
