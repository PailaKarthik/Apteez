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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@apteez/ui';
import {
  Coins,
  Gift,
  History as HistoryIcon,
  PiggyBank,
  Sparkles,
  Swords,
  Trophy,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ComingSoonHero } from '@/components/shared/coming-soon-hero';
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
    return (
      <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-3" aria-busy="true" aria-label="Loading points">
        {['from-primary/25 to-primary/10', 'from-primary/15 to-primary/[0.07]', 'from-muted/40 to-transparent'].map(
          (wash, i) => (
          <Card key={i} className="animate-fade-up overflow-hidden" style={{ animationDelay: `${i * 80}ms` }} aria-hidden>
            <div className={`h-1 bg-gradient-to-r ${wash}`} />
            <CardContent className="space-y-2 p-4">
              <div className="skeleton-shine h-8 w-24 rounded-lg" />
              <div className="skeleton-shine h-3 w-28 rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return <ErrorState description="Could not load your points." onRetry={() => void refetch()} />;
  }
  // Visual hierarchy in brand violet: Balance is the hero (animated
  // gradient), Earned leans on solid primary, Spent stays quiet neutral.
  const stats = [
    {
      label: 'Balance',
      value: String(data.total),
      hint: 'Ready to redeem',
      icon: Wallet,
      wash: 'from-primary/25 via-primary/10 to-transparent',
      tile: 'bg-gradient-to-br from-primary to-accent-foreground text-white shadow-lg shadow-primary/30',
      valueClass: 'gradient-text',
    },
    {
      label: 'Lifetime earned',
      value: String(data.lifetimeEarned),
      hint: 'Every point kept',
      icon: Trophy,
      wash: 'from-primary/15 via-primary/[0.07] to-transparent',
      tile: 'bg-gradient-to-br from-primary to-accent-foreground text-white shadow-lg shadow-primary/30',
      valueClass: 'text-foreground',
    },
    {
      label: 'Lifetime spent',
      value: String(data.lifetimeSpent),
      hint: 'Rewards claimed',
      icon: PiggyBank,
      wash: 'from-muted/60 to-transparent',
      tile: 'bg-muted text-muted-foreground',
      valueClass: 'text-muted-foreground',
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-3">
      {stats.map((stat, index) => (
        <Card
          key={stat.label}
          className="card-lift card-shine animate-fade-up relative overflow-hidden"
          style={{ animationDelay: `${index * 80}ms` }}
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${stat.wash}`} aria-hidden />
          <CardContent className="relative space-y-2 p-4">
            <div className="flex items-start justify-between">
              <span className={`flex size-10 items-center justify-center rounded-xl ${stat.tile}`} aria-hidden>
                <stat.icon className="size-5" />
              </span>
              <span className="rounded-full border border-border bg-card/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                {stat.hint}
              </span>
            </div>
            <p className={`font-metric text-2xl font-extrabold sm:text-3xl ${stat.valueClass}`}>{stat.value}</p>
            <p className="text-xs leading-snug text-muted-foreground">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EarningRules(): React.JSX.Element {
  const { data, isPending } = useRewardRules();
  if (isPending) {
    return (
      <Card aria-busy="true" aria-label="Loading earning rules">
        <CardContent className="space-y-2 p-6">
          <div className="skeleton-shine h-5 w-32 rounded-md" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="skeleton-shine size-9 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton-shine h-4 w-1/3 rounded-md" />
                <div className="skeleton-shine h-3 w-2/3 rounded-md" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }
  if (!data || data.items.length === 0) {
    return <div />;
  }
  return (
    <Card className="animate-fade-in overflow-hidden">
      <CardContent className="space-y-2 p-6">
        <CardTitle className="flex items-center gap-2 text-card-title">
          <Sparkles className="size-4 text-primary" aria-hidden />
          Ways to earn
        </CardTitle>
        <ul className="divide-y divide-border">
          {data.items.map((rule, index) => (
            <li
              key={rule.key}
              className="row-enter row-glow flex items-center gap-3 rounded-lg py-2.5 text-sm"
              style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
            >
              <span className="icon-tile size-9 shrink-0" aria-hidden>
                <Coins className="size-4" />
              </span>
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
              <span className="font-metric font-extrabold text-primary">+{rule.points}</span>
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
        <DialogTitle className="flex items-center gap-2">
          <Gift className="size-5 text-primary" aria-hidden />
          Redeem {reward.name}?
        </DialogTitle>
      </DialogHeader>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Points required</dt>
          <dd className="gradient-text font-metric font-extrabold">{reward.pointsCost}</dd>
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
      <Button className="btn-sheen w-full" disabled={redeem.isPending} onClick={onConfirm}>
        {redeem.isPending ? <span className="typing-dots">Redeeming</span> : `Confirm · ${reward.pointsCost} pts`}
      </Button>
    </DialogContent>
  );
}

function CatalogSkeleton(): React.JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading catalog">
      {Array.from({ length: 6 }, (_, i) => (
        <Card key={i} className="animate-fade-up overflow-hidden" style={{ animationDelay: `${i * 70}ms` }} aria-hidden>
          <div className="loading-rail h-1" aria-hidden>
            <span />
          </div>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="skeleton-shine h-5 w-1/2 rounded-md" />
              <div className="skeleton-shine h-5 w-16 rounded-full" />
            </div>
            <div className="skeleton-shine h-3 w-full rounded-md" />
            <div className="skeleton-shine h-9 w-full rounded-lg" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Catalog({ balance }: { balance: number }): React.JSX.Element {
  const { data, isLoading, isError, refetch } = useRewardCatalog();
  const [selected, setSelected] = useState<RewardDto | null>(null);
  if (isLoading) {
    return <CatalogSkeleton />;
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
        {data.items.map((reward, index) => {
          const disabled = !reward.inStock || balance < reward.pointsCost;
          // Affordable rewards get the full glow treatment; the rest stay
          // quiet so the eye lands where the action is.
          const affordable = reward.inStock && balance >= reward.pointsCost;
          return (
            <div
              key={reward.id}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
            >
              <Card
                className={`card-lift card-shine h-full overflow-hidden ${!reward.inStock ? 'opacity-70' : ''} ${affordable ? 'border-primary/50 shadow-[0_0_32px_-12px_hsl(var(--primary)/0.6)]' : ''}`}
              >
                <span
                  className={`block h-1 bg-gradient-to-r from-primary to-accent-foreground ${affordable ? '' : 'opacity-50'}`}
                  aria-hidden
                />
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-card-title">{reward.name}</CardTitle>
                    <Badge variant="outline" className="shrink-0">{reward.category}</Badge>
                  </div>
                  {reward.description ? (
                    <CardDescription className="line-clamp-2">{reward.description}</CardDescription>
                  ) : null}
                  <div className="flex items-center justify-between text-sm">
                    <span
                      className={`font-metric text-xl font-extrabold ${affordable ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      {reward.pointsCost}{' '}
                      <span className="text-xs font-normal text-muted-foreground">pts</span>
                    </span>
                    <span className="rounded-full bg-muted/70 px-2 py-0.5 text-xs text-muted-foreground">
                      {reward.stockQuantity === null ? 'Unlimited' : `${reward.stockQuantity} left`}
                    </span>
                  </div>
                  <Button
                    className={`w-full transition-all duration-300 ${disabled ? '' : 'btn-sheen hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/25'}`}
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
            </div>
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
    return <CatalogSkeleton />;
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
    <Card className="animate-fade-in">
      <CardContent className="p-6">
        <ul className="divide-y divide-border">
          {data.items.map((row, index) => (
            <li
              key={row.id}
              className="row-enter row-glow flex items-center gap-3 rounded-lg py-2.5 text-sm"
              style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
            >
              <span
                className={`w-16 shrink-0 rounded-lg px-1.5 py-1 text-center font-metric font-bold ${row.amount >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}
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
    return <CatalogSkeleton />;
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
    <Card className="animate-fade-in">
      <CardContent className="p-6">
        <ul className="divide-y divide-border">
          {items.map((row) => (
            <li key={row.id} className="row-glow flex items-center gap-3 rounded-lg py-2.5 text-sm">
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

function VaultVisual(): React.JSX.Element {
  return (
    <div className="relative mx-auto flex size-56 items-center justify-center" aria-hidden>
      <span className="conic-ring absolute inset-0 rounded-full opacity-30 blur-[2px]" />
      <span className="absolute inset-2 rounded-full border border-primary/30" />
      <span className="absolute inset-6 animate-spin-slow rounded-full border border-dashed border-primary/40" />
      <span className="flex size-24 items-center justify-center rounded-3xl border border-primary/40 bg-gradient-to-br from-primary to-accent-foreground shadow-2xl shadow-primary/30">
        <Gift className="size-11 text-white" />
      </span>
      <span className="animate-float absolute -top-1 right-8 flex size-11 items-center justify-center rounded-2xl border border-primary/40 bg-card/80 shadow-lg backdrop-blur">
        <Coins className="size-5 text-primary" />
      </span>
      <span className="animate-float-slow absolute bottom-3 left-6 flex size-11 items-center justify-center rounded-2xl border border-primary/40 bg-card/80 shadow-lg backdrop-blur">
        <Trophy className="size-5 text-primary" />
      </span>
      <span className="animate-float absolute bottom-10 right-2 flex items-center gap-1 rounded-full border border-primary/40 bg-card/80 px-2.5 py-1 font-metric text-xs font-bold text-primary shadow-lg [animation-delay:-2s]">
        +250
      </span>
    </div>
  );
}

export default function RewardsPage(): React.JSX.Element {
  const { data: points } = usePointsBalance();
  return (
    <RequireAuth>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Points · Perks · Prestige"
          title="Rewards"
          description="Earn points for real progress, redeem them for ApteeZ rewards."
        />
        <ComingSoonHero
          variant="luxe"
          eyebrow="Rewards vault 2.0"
          title={
            <>
              A richer vault is <span className="gradient-text-cool">on its way.</span>
            </>
          }
          description="Points keep accruing and nothing you earned goes away — the catalog and earning rules below stay live until the upgrade lands with bigger drops, limited editions and surprise bonuses."
          visual={<VaultVisual />}
          actions={
            <>
              <Button asChild className="btn-sheen shadow-xl shadow-primary/25">
                <Link href="/challenge">
                  <Swords aria-hidden />
                  Earn right now
                </Link>
              </Button>
              <Button
                variant="outline"
                asChild
                className="transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:text-primary"
              >
                <Link href="/leaderboard">
                  <HistoryIcon aria-hidden />
                  Top earners
                </Link>
              </Button>
            </>
          }
          perks={[
            {
              icon: Gift,
              title: 'Bigger drops',
              description: 'Limited-edition rewards with real shelf presence, refreshed monthly.',
            },
            {
              icon: Coins,
              title: 'Bonus events',
              description: 'Double-point weekends and streak multipliers for consistent solvers.',
            },
            {
              icon: Trophy,
              title: 'Prestige tiers',
              description: 'Unlock elite catalog rows as your lifetime earnings climb.',
            },
          ]}
        />
        <PointsOverview />
        <Tabs defaultValue="catalog">
          <TabsList className="glass sticky top-top-bar z-10 max-w-full justify-start overflow-x-auto shadow-sm">
            <TabsTrigger value="catalog" className="shrink-0 whitespace-nowrap">
              Catalog
            </TabsTrigger>
            <TabsTrigger value="history" className="shrink-0 whitespace-nowrap">
              History
            </TabsTrigger>
            <TabsTrigger value="redemptions" className="shrink-0 whitespace-nowrap">
              My redemptions
            </TabsTrigger>
            <TabsTrigger value="earn" className="shrink-0 whitespace-nowrap">
              Ways to earn
            </TabsTrigger>
          </TabsList>
          <TabsContent value="catalog" className="animate-fade-in pt-4">
            <Catalog balance={points?.total ?? 0} />
          </TabsContent>
          <TabsContent value="history" className="animate-fade-in pt-4">
            <History />
          </TabsContent>
          <TabsContent value="redemptions" className="animate-fade-in pt-4">
            <MyRedemptions />
          </TabsContent>
          <TabsContent value="earn" className="animate-fade-in pt-4">
            <EarningRules />
          </TabsContent>
        </Tabs>
      </div>
    </RequireAuth>
  );
}
