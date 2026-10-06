'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  ErrorState,
  Input,
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
import { useAdminAccess, useAdminUser, useSetUserRoles, useSetUserStatus } from '@/hooks/use-admin';

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="font-metric text-lg font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default function AdminUserDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { allowed, isLoading: accessLoading } = useAdminAccess(['manage:users']);
  const { data, isLoading, isError, refetch } = useAdminUser(id, allowed);
  const setStatus = useSetUserStatus(id ?? '');
  const setRoles = useSetUserRoles(id ?? '');

  const [statusOpen, setStatusOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [status, setStatusValue] = useState('SUSPENDED');
  const [reason, setReason] = useState('');
  const [suspendedUntil, setSuspendedUntil] = useState('');
  const [roles, setRolesValue] = useState('');

  if (accessLoading || isLoading) {
    return <LoadingState title="Loading user…" />;
  }
  if (!allowed) {
    return <EmptyState title="No access" description="Your staff account lacks manage:users." />;
  }
  if (isError || !data) {
    return <ErrorState description="Could not load this user." onRetry={() => void refetch()} />;
  }

  const onStatus = (): void => {
    setStatus.mutate(
      {
        status,
        reason: reason.trim(),
        ...(suspendedUntil ? { suspendedUntil: new Date(suspendedUntil).toISOString() } : {}),
      },
      {
        onSuccess: () => {
          toast.success(`Status set to ${status}.`);
          setStatusOpen(false);
          setReason('');
          void refetch();
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : 'Status change failed.'),
      },
    );
  };

  const onRoles = (): void => {
    const list = roles
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean);
    setRoles.mutate(
      { roles: list },
      {
        onSuccess: () => {
          toast.success('Roles updated.');
          setRolesOpen(false);
          void refetch();
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : 'Role change failed.'),
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-card-title">{data.displayName}</CardTitle>
            <Badge variant={data.isActive ? 'success' : 'destructive'}>{data.accountStatus}</Badge>
          </div>
          <p className="break-words text-sm text-muted-foreground">
            {data.username ? `@${data.username} · ` : ''}
            <span className="break-all">{data.email}</span>
            {data.institution ? ` · ${data.institution}` : ''}
            {data.country ? ` · ${data.country}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            Roles: {data.roles.join(', ') || '—'}
            {data.suspendedUntil
              ? ` · suspended until ${new Date(data.suspendedUntil).toLocaleString()}`
              : ''}
            {data.statusReason ? ` · ${data.statusReason}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Change status
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change account status</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {data.displayName} ({data.email}). Suspensions need a future expiry; bans and
                    deactivations take effect immediately. The user is notified.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-status">Status</Label>
                    <Select value={status} onValueChange={setStatusValue}>
                      <SelectTrigger id="admin-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="SUSPENDED">Suspended</SelectItem>
                        <SelectItem value="BANNED">Banned</SelectItem>
                        <SelectItem value="DEACTIVATED">Deactivated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {status === 'SUSPENDED' ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-until">Suspend until</Label>
                      <Input
                        id="admin-until"
                        type="datetime-local"
                        value={suspendedUntil}
                        onChange={(event) => setSuspendedUntil(event.target.value)}
                      />
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-reason">Reason (required)</Label>
                    <Textarea
                      id="admin-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={setStatus.isPending || reason.trim().length < 5}
                    onClick={onStatus}
                  >
                    {setStatus.isPending ? 'Saving…' : 'Apply status'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Edit roles
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit roles</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Comma-separated role names (user, admin). You cannot change your own roles or
                    remove the last administrator.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-roles">Roles</Label>
                    <Input
                      id="admin-roles"
                      value={roles}
                      onChange={(event) => setRolesValue(event.target.value)}
                      placeholder="user, admin"
                    />
                  </div>
                  <Button className="w-full" disabled={setRoles.isPending} onClick={onRoles}>
                    {setRoles.isPending ? 'Saving…' : 'Apply roles'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Solved" value={String(data.stats.solvedCount)} />
        <Stat label="Submissions" value={String(data.stats.submissions)} />
        <Stat label="Challenges" value={String(data.stats.challengesPlayed)} />
        <Stat label="Contests" value={String(data.stats.contestsEntered)} />
        <Stat label="Events" value={String(data.stats.eventsJoined)} />
        <Stat
          label="Contributions"
          value={`${data.stats.contributions.approved}/${data.stats.contributions.total}`}
        />
        <Stat label="Points" value={String(data.stats.points)} />
        <Stat label="Open reports" value={String(data.stats.reportsFiledAgainst)} />
      </div>
    </div>
  );
}
