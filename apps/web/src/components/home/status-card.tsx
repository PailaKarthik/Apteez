'use client';

import { Activity, CircleAlert } from 'lucide-react';
import { Badge, Card, CardContent } from '@apteez/ui';
import { useHealth } from '@/hooks/use-health';

/**
 * Live platform status. Proves the web → API wiring end to end; when the API
 * is not running it says so plainly instead of failing the page.
 */
export function StatusCard(): React.JSX.Element {
  const { data, isError, isPending } = useHealth();

  if (isPending) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5">
          <span className="size-2.5 animate-pulse rounded-full bg-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Checking platform status…</p>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-5">
          <CircleAlert className="size-5 text-destructive" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">API offline</p>
            <p className="text-xs text-muted-foreground">
              Start it with <code className="rounded bg-muted px-1">pnpm dev</code> to enable live
              features.
            </p>
          </div>
          <Badge variant="destructive" className="ml-auto">
            Offline
          </Badge>
        </CardContent>
      </Card>
    );
  }

  const db = data.checks.database;
  const redis = data.checks.redis;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-5">
        <Activity className="size-5 text-success" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-foreground">All systems operational</p>
          <p className="text-xs text-muted-foreground">
            API v{data.version} · {data.environment} · database {db.latencyMs ?? '—'}ms · redis{' '}
            {redis.latencyMs ?? '—'}ms
          </p>
        </div>
        <Badge variant="success" className="ml-auto">
          {data.status === 'ok' ? 'Operational' : 'Degraded'}
        </Badge>
      </CardContent>
    </Card>
  );
}
