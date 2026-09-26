'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@apteez/ui';
import { useAdminAccess, useAdminUsers } from '@/hooks/use-admin';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  BANNED: 'destructive',
  DEACTIVATED: 'secondary',
};

export default function AdminUsersPage(): React.JSX.Element {
  const { allowed, isLoading: accessLoading } = useAdminAccess(['manage:users']);
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [status, setStatus] = useState<string>('any');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useAdminUsers(
    {
      q: submitted || undefined,
      status: status === 'any' ? undefined : status,
      role: role.trim() || undefined,
      page,
    },
    allowed,
  );

  if (accessLoading || isLoading) {
    return <LoadingState title="Loading users…" />;
  }
  if (!allowed) {
    return (
      <EmptyState
        title="No user-management access"
        description="Your staff account lacks manage:users."
      />
    );
  }
  if (isError || !data) {
    return <ErrorState description="Could not load users." onRetry={() => void refetch()} />;
  }

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
          label="Search users"
          placeholder="Email, username or name…"
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
          <SelectTrigger className="w-44" aria-label="Status filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="BANNED">Banned</SelectItem>
            <SelectItem value="DEACTIVATED">Deactivated</SelectItem>
          </SelectContent>
        </Select>
        <Input
          aria-label="Role filter"
          placeholder="Role…"
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
            setPage(1);
          }}
          className="sm:w-36"
        />
        <Button type="submit">Search</Button>
      </form>

      {data.items.length === 0 ? (
        <EmptyState title="No users found" description="Adjust the search or filters." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Roles</th>
                <th className="px-3 py-2 font-medium">Joined</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <span className="block font-medium">{row.displayName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.username ? `@${row.username} · ` : ''}
                      {row.email}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_TONE[row.accountStatus] ?? 'secondary'}>
                      {row.accountStatus}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {row.roles.join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/users/${row.id}`}>Open</Link>
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
          {' · '}
          <span className="font-metric">{data.total}</span> users
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
