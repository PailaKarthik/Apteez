'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@apteez/ui';
import { PageHeader } from '@/components/shared/page-header';
import { RequireAuth } from '@/components/auth/require-auth';
import { ApiError } from '@/lib/api-client';
import {
  useCancelRedemption,
  usePointsBalance,
  usePointsHistory,
  useRedeem,
  useRedemptions,
  useRewardCatalog,
  useRewardRules,
} from '@/hooks/use-rewards';
import type { RewardDto } from '@apteez/types';

function PointsOverview(): React.JSX.Element {
  const { data, isLoading, isError, refetch } = usePointsBalance();
  if (isLoading) {
    return <LoadingState title="Loading points…" />;
  }
  if (isError || !data) {
    return <ErrorState description="Could not load your points." onRetry={() => void refetch()} />;
  }
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: 'Balance', value: String(data.total) },
        { label: 'Lifetime earned', value: String(data.lifetimeEarned) },
        { label: 'Lifetime spent', value: String(data.lifetimeSpent) },
      ].map((stat) => (
        <Card key={stat.label}>
          <CardContent className="space-y-1 p-4">
            <p className="font-metric text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EarningRules(): React.JSX.Element {
  const { data } = useRewardRules();
  if (!data || data.items.length === 0) {
    return <div />;
  }
  return (
    <Card>
      <CardContent className="space-y-2 p-6">
        <CardTitle className="text-card-title">Ways to earn</CardTitle>
        <ul className="divide-y divide-border">
          {data.items.map((rule) => (
            <li key={rule.key} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1">
                <span className="font-medium">{rule.name}</span>
                {rule.description ? (
                  <span className="block text-xs text-muted-foreground">{rule.description}</span>
                ) : null}
              </span>
              {rule.dailyCap !== null ? (
                <Badge variant="outline">up to {rule.dailyCap}/day</Badge>
              ) : null}
              {rule.maxPerUser !== null ? (
                <Badge variant="outline">max {rule.maxPerUser} ever</Badge>
              ) : null}
              <span className="font-metric font-semibold text-success">+{rule.points}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RedeemDialog({
  reward,
  balance,
  onClose,
}: {
  reward: RewardDto;
  balance: number;
  onClose: () => void;
}): React.JSX.Element {
  const redeem = useRedeem();
  const key = useMemo(
    () =>
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${reward.id}`,
    [reward.id],
  );
  const remaining = balance - reward.pointsCost;
  const onConfirm = (): void => {
    redeem.mutate(
      { rewardId: reward.id, idempotencyKey: key },
      {
        onSuccess: () => {
          toast.success(`Redeemed ${reward.name}.`);
          onClose();
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : 'Redemption failed.'),
      },
    );
  };
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Redeem {reward.name}?</DialogTitle>
      </DialogHeader>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Points required</dt>
          <dd className="font-metric font-semibold">{reward.pointsCost}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Current balance</dt>
          <dd className="font-metric">{balance}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Remaining after</dt>
          <dd className="font-metric">{remaining}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Availability</dt>
          <dd>{reward.stockQuantity === null ? 'In stock' : `${reward.stockQuantity} left`}</dd>
        </div>
      </dl>
      <CardDescription>
        Fulfillment is handled manually for now — no shipping details are collected.
      </CardDescription>
      <Button className="w-full" disabled={redeem.isPending} onClick={onConfirm}>
        {redeem.isPending ? 'Redeeming…' : `Confirm · ${reward.pointsCost} pts`}
      </Button>
    </DialogContent>
  );
}

function Catalog({ balance }: { balance: number }): React.JSX.Element {
  const { data, isLoading, isError, refetch } = useRewardCatalog();
  const [selected, setSelected] = useState<RewardDto | null>(null);
  if (isLoading) {
    return <LoadingState title="Loading catalog…" />;
  }
  if (isError || !data) {
    return <ErrorState description="Could not load the catalog." onRetry={() => void refetch()} />;
  }
  if (data.items.length === 0) {
    return (
      <EmptyState title="No rewards yet" description="New rewards appear here when they launch." />
    );
  }
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.items.map((reward) => {
          const disabled = !reward.inStock || balance < reward.pointsCost;
          return (
            <Card key={reward.id} className={!reward.inStock ? 'opacity-70' : undefined}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-card-title">{reward.name}</CardTitle>
                  <Badge variant="outline">{reward.category}</Badge>
                </div>
                {reward.description ? (
                  <CardDescription className="line-clamp-2">{reward.description}</CardDescription>
                ) : null}
                <div className="flex items-center justify-between text-sm">
                  <span className="font-metric text-lg font-bold">
                    {reward.pointsCost}{' '}
                    <span className="text-xs font-normal text-muted-foreground">pts</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {reward.stockQuantity === null ? 'Unlimited' : `${reward.stockQuantity} left`}
                  </span>
                </div>
                <Button
                  className="w-full"
                  variant={disabled ? 'ghost' : 'default'}
                  disabled={disabled}
                  onClick={() => setSelected(reward)}
                >
                  {!reward.inStock
                    ? 'Out of stock'
                    : balance < reward.pointsCost
                      ? 'Not enough points'
                      : 'Redeem'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
      >
        {selected ? (
          <RedeemDialog reward={selected} balance={balance} onClose={() => setSelected(null)} />
        ) : null}
      </Dialog>
    </>
  );
}

function History(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = usePointsHistory(page);
  if (isLoading) {
    return <LoadingState title="Loading history…" />;
  }
  if (isError || !data) {
    return <ErrorState description="Could not load history." />;
  }
  if (data.items.length === 0) {
    return (
      <EmptyState
        title="No transactions yet"
        description="Earn points by solving, competing and contributing."
      />
    );
  }
  return (
    <Card>
      <CardContent className="p-6">
        <ul className="divide-y divide-border">
          {data.items.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span
                className={`w-16 shrink-0 font-metric font-bold ${row.amount >= 0 ? 'text-success' : 'text-destructive'}`}
              >
                {row.amount >= 0 ? `+${row.amount}` : row.amount}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.description ?? row.reason}</span>
                <span className="block text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  {' · bal '}
                  <span className="font-metric">{row.balanceAfter}</span>
                </span>
              </span>
              <Badge variant="outline">{row.type}</Badge>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page <span className="font-metric">{data.page}</span> of{' '}
            <span className="font-metric">{data.totalPages}</span>
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MyRedemptions(): React.JSX.Element {
  const { data, isLoading } = useRedemptions();
  const cancel = useCancelRedemption();
  if (isLoading) {
    return <LoadingState title="Loading redemptions…" />;
  }
  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        title="No redemptions"
        description="Redeemed rewards and their fulfillment status appear here."
      />
    );
  }
  return (
    <Card>
      <CardContent className="p-6">
        <ul className="divide-y divide-border">
          {items.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.rewardName}</span>
                <span className="block text-xs text-muted-foreground">
                  <span className="font-metric">{row.pointsCost}</span> pts ·{' '}
                  {new Date(row.createdAt).toLocaleDateString()}
                </span>
              </span>
              <Badge
                variant={
                  row.status === 'FULFILLED'
                    ? 'success'
                    : row.status === 'CANCELLED' || row.status === 'FAILED'
                      ? 'destructive'
                      : 'outline'
                }
              >
                {row.status}
              </Badge>
              {row.status === 'PENDING' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={cancel.isPending}
                  onClick={() =>
                    cancel.mutate(row.id, {
                      onSuccess: () => toast.success('Redemption cancelled and refunded.'),
                      onError: (error) =>
                        toast.error(error instanceof ApiError ? error.message : 'Cancel failed.'),
                    })
                  }
                >
                  Cancel
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function RewardsPage(): React.JSX.Element {
  const { data: points } = usePointsBalance();
  return (
    <RequireAuth>
      <div className="space-y-6">
        <PageHeader
          title="Rewards"
          description="Earn points for real progress, redeem them for ApteeZ rewards."
        />
        <p
          role="status"
          className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
        >
          <span className="font-semibold">New reward system landing soon</span> — points keep
          accruing and nothing you earned goes away; the catalog and earning rules below stay live
          until the upgrade.
        </p>
        <PointsOverview />
        <Tabs defaultValue="catalog">
          <TabsList>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="redemptions">My redemptions</TabsTrigger>
            <TabsTrigger value="earn">Ways to earn</TabsTrigger>
          </TabsList>
          <TabsContent value="catalog" className="pt-4">
            <Catalog balance={points?.total ?? 0} />
          </TabsContent>
          <TabsContent value="history" className="pt-4">
            <History />
          </TabsContent>
          <TabsContent value="redemptions" className="pt-4">
            <MyRedemptions />
          </TabsContent>
          <TabsContent value="earn" className="pt-4">
            <EarningRules />
          </TabsContent>
        </Tabs>
      </div>
    </RequireAuth>
  );
}
