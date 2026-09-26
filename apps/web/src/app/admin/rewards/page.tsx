'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@apteez/ui';
import type {
  AchievementAdminDto,
  RedemptionDto,
  RewardDto,
  RewardRuleAdminDto,
  SuspiciousFlagDto,
} from '@apteez/types';
import { ApiError, apiFetch } from '@/lib/api-client';
import { useAdminAccess } from '@/hooks/use-admin';

function useAdminRewardsList(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'rewards'],
    queryFn: () => apiFetch<{ items: RewardDto[] }>('/admin/rewards'),
    enabled,
  });
}

function useAdminRulesList(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'reward-rules'],
    queryFn: () => apiFetch<{ items: RewardRuleAdminDto[] }>('/admin/reward-rules'),
    enabled,
  });
}

function useAdminAchievementsList(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'achievements'],
    queryFn: () => apiFetch<{ items: AchievementAdminDto[] }>('/admin/achievements'),
    enabled,
  });
}

const KNOWN_TRIGGERS = [
  'onboarding',
  'problem-solve',
  'challenge-complete',
  'contest-participate',
  'event-participate',
];

/** Create/edit dialog for an earning rule. The trigger is what makes it dynamic. */
function RuleDialog({
  initial,
  open,
  onOpenChange,
  onSave,
}: {
  initial: RewardRuleAdminDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (body: Record<string, unknown>) => void;
}): React.JSX.Element {
  const [key, setKey] = useState(initial?.key ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [triggerChoice, setTriggerChoice] = useState(
    initial && KNOWN_TRIGGERS.includes(initial.trigger) ? initial.trigger : 'custom',
  );
  const [triggerCustom, setTriggerCustom] = useState(
    initial && !KNOWN_TRIGGERS.includes(initial.trigger) ? initial.trigger : '',
  );
  const [points, setPoints] = useState(String(initial?.points ?? 10));
  const [category, setCategory] = useState(initial?.category ?? 'activity');
  const [dailyCap, setDailyCap] = useState(
    initial?.dailyCap === null || initial?.dailyCap === undefined ? '' : String(initial.dailyCap),
  );
  const [maxPerUser, setMaxPerUser] = useState(
    initial?.maxPerUser === null || initial?.maxPerUser === undefined
      ? ''
      : String(initial.maxPerUser),
  );
  const [cooldown, setCooldown] = useState(
    initial?.cooldownSeconds === null || initial?.cooldownSeconds === undefined
      ? ''
      : String(initial.cooldownSeconds),
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const save = (): void => {
    const trigger = triggerChoice === 'custom' ? triggerCustom.trim().toLowerCase() : triggerChoice;
    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || undefined,
      trigger,
      points: Number(points),
      category: category.trim() || 'activity',
      dailyCap: dailyCap.trim() === '' ? null : Number(dailyCap),
      maxPerUser: maxPerUser.trim() === '' ? null : Number(maxPerUser),
      cooldownSeconds: cooldown.trim() === '' ? null : Number(cooldown),
      isActive,
    };
    if (!initial) {
      body.key = key.trim().toLowerCase();
    }
    onSave(body);
    onOpenChange(false);
  };

  const valid =
    name.trim().length >= 2 &&
    (triggerChoice !== 'custom' || triggerCustom.trim().length >= 2) &&
    Number.isFinite(Number(points)) &&
    Number(points) >= 1 &&
    (!initial || key.trim().length >= 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit earning rule' : 'New earning rule'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!initial ? (
            <div className="space-y-1.5">
              <Label htmlFor="rule-key">Key (unique, lowercase-hyphens)</Label>
              <Input
                id="rule-key"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="weekend-grind"
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Key <span className="font-metric">{initial.key}</span> is immutable — the trigger
              below decides when it fires.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Name</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Weekend grind bonus"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-trigger">Fires on</Label>
            <select
              id="rule-trigger"
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={triggerChoice}
              onChange={(event) => setTriggerChoice(event.target.value)}
            >
              {KNOWN_TRIGGERS.map((trigger) => (
                <option key={trigger} value={trigger}>
                  {trigger}
                </option>
              ))}
              <option value="custom">Custom trigger…</option>
            </select>
            {triggerChoice === 'custom' ? (
              <Input
                value={triggerCustom}
                onChange={(event) => setTriggerCustom(event.target.value)}
                placeholder="streak-milestone"
                aria-label="Custom trigger"
              />
            ) : null}
            <p className="text-xs text-muted-foreground">
              Every active rule sharing this trigger pays out on the event — no code changes needed.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule-points">Points</Label>
              <Input
                id="rule-points"
                inputMode="numeric"
                value={points}
                onChange={(event) => setPoints(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-category">Category</Label>
              <Input
                id="rule-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="activity"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-daily">Daily cap (empty = none)</Label>
              <Input
                id="rule-daily"
                inputMode="numeric"
                value={dailyCap}
                onChange={(event) => setDailyCap(event.target.value)}
                placeholder="10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-max">Max per user ever (empty = none)</Label>
              <Input
                id="rule-max"
                inputMode="numeric"
                value={maxPerUser}
                onChange={(event) => setMaxPerUser(event.target.value)}
                placeholder="1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-cooldown">Cooldown seconds (empty = none)</Label>
              <Input
                id="rule-cooldown"
                inputMode="numeric"
                value={cooldown}
                onChange={(event) => setCooldown(event.target.value)}
                placeholder="3600"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-description">Description (optional)</Label>
            <Textarea
              id="rule-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="size-4 accent-primary"
            />
            Active (inactive rules never fire)
          </label>
          <Button className="w-full" disabled={!valid} onClick={save}>
            {initial ? 'Save rule' : 'Create rule'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Edit dialog for an achievement (display + payout; unlock logic stays in code). */
function AchievementDialog({
  initial,
  open,
  onOpenChange,
  onSave,
}: {
  initial: AchievementAdminDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (body: Record<string, unknown>) => void;
}): React.JSX.Element {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [category, setCategory] = useState(initial.category);
  const [points, setPoints] = useState(String(initial.points));
  const [isActive, setIsActive] = useState(initial.isActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit achievement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Key <span className="font-metric">{initial.key}</span> · unlock conditions are
            code-driven; here you control the badge text, payout and availability.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="ach-name">Name</Label>
            <Input id="ach-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ach-description">Description</Label>
            <Textarea
              id="ach-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ach-category">Category</Label>
              <Input
                id="ach-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ach-points">Points</Label>
              <Input
                id="ach-points"
                inputMode="numeric"
                value={points}
                onChange={(event) => setPoints(event.target.value)}
              />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="size-4 accent-primary"
            />
            Active
          </label>
          <Button
            className="w-full"
            disabled={name.trim().length < 2 || !Number.isFinite(Number(points))}
            onClick={() => {
              onSave({
                name: name.trim(),
                description: description.trim() || null,
                category: category.trim() || 'general',
                points: Number(points),
                isActive,
              });
              onOpenChange(false);
            }}
          >
            Save achievement
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useAdminRedemptions(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'redemptions'],
    queryFn: () =>
      apiFetch<{ items: RedemptionDto[] }>('/admin/rewards/redemptions?page=1&pageSize=20'),
    enabled,
  });
}

function useSuspicious(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'suspicious'],
    queryFn: () => apiFetch<{ items: SuspiciousFlagDto[] }>('/admin/rewards/suspicious'),
    enabled,
  });
}

export default function AdminRewardsPage(): React.JSX.Element {
  const { allowed, isLoading: accessLoading } = useAdminAccess(['manage:rewards']);
  const queryClient = useQueryClient();
  const rewards = useAdminRewardsList(allowed);
  const rules = useAdminRulesList(allowed);
  const achievements = useAdminAchievementsList(allowed);
  const redemptions = useAdminRedemptions(allowed);
  const suspicious = useSuspicious(allowed);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RewardRuleAdminDto | null>(null);
  const [editingAchievement, setEditingAchievement] = useState<AchievementAdminDto | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustUser, setAdjustUser] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
  };

  const mutate = (path: string, method: string, body: unknown, success: string): void => {
    apiFetch<unknown>(path, { method, body })
      .then(() => {
        toast.success(success);
        refresh();
      })
      .catch((error: unknown) =>
        toast.error(error instanceof ApiError ? error.message : 'Action failed.'),
      );
  };

  if (accessLoading || rewards.isLoading) {
    return <LoadingState title="Loading rewards…" />;
  }
  if (!allowed) {
    return <EmptyState title="No access" description="Reward management needs manage:rewards." />;
  }
  if (rewards.isError || !rewards.data) {
    return (
      <ErrorState description="Could not load rewards." onRetry={() => void rewards.refetch()} />
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="rules">Earning rules</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
          <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
          <TabsTrigger value="suspicious">Suspicious</TabsTrigger>
          <TabsTrigger value="adjust">Adjust points</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-3 pt-2">
          {rewards.data.items.length === 0 ? (
            <EmptyState title="No rewards" description="Create rewards to seed the catalog." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Reward</th>
                    <th className="px-3 py-2 font-medium">Cost</th>
                    <th className="px-3 py-2 font-medium">Stock</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rewards.data.items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 font-metric">{row.pointsCost}</td>
                      <td className="px-3 py-2 font-metric">{row.stockQuantity ?? '∞'}</td>
                      <td className="px-3 py-2">
                        <Badge variant={row.isActive ? 'success' : 'secondary'}>
                          {row.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              mutate(
                                `/admin/rewards/${row.id}`,
                                'PATCH',
                                { isActive: !row.isActive },
                                'Reward updated.',
                              )
                            }
                          >
                            {row.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const next = window.prompt(
                                'Set stock (empty = unlimited):',
                                row.stockQuantity === null ? '' : String(row.stockQuantity),
                              );
                              if (next === null) {
                                return;
                              }
                              mutate(
                                `/admin/rewards/${row.id}/stock`,
                                'PATCH',
                                { stockQuantity: next.trim() === '' ? null : Number(next) },
                                'Stock updated.',
                              );
                            }}
                          >
                            Stock
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rules" className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Rules fire on triggers — several rules can share one trigger, each paying out with its
              own caps.
            </p>
            <Button
              size="sm"
              onClick={() => {
                setEditingRule(null);
                setRuleDialogOpen(true);
              }}
            >
              New rule
            </Button>
          </div>
          {!rules.data ? (
            <LoadingState title="Loading rules…" />
          ) : rules.data.items.length === 0 ? (
            <EmptyState title="No rules" description="Create the first earning rule." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Rule</th>
                    <th className="px-3 py-2 font-medium">Trigger</th>
                    <th className="px-3 py-2 font-medium">Points</th>
                    <th className="px-3 py-2 font-medium">Limits</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.data.items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-3 py-2">
                        <span className="block font-medium">{row.name}</span>
                        <span className="block font-metric text-xs text-muted-foreground">
                          {row.key}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{row.trigger}</Badge>
                      </td>
                      <td className="px-3 py-2 font-metric">{row.points}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.dailyCap !== null ? `${row.dailyCap}/day` : '∞/day'}
                        {' · '}
                        {row.maxPerUser !== null ? `max ${row.maxPerUser}` : 'no lifetime cap'}
                        {row.cooldownSeconds !== null ? ` · ${row.cooldownSeconds}s cool` : ''}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={row.isActive ? 'success' : 'secondary'}>
                          {row.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingRule(row);
                              setRuleDialogOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              mutate(
                                `/admin/reward-rules/${row.id}`,
                                'PATCH',
                                { isActive: !row.isActive },
                                'Rule updated.',
                              )
                            }
                          >
                            {row.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <RuleDialog
            key={editingRule?.id ?? 'new'}
            initial={editingRule}
            open={ruleDialogOpen}
            onOpenChange={setRuleDialogOpen}
            onSave={(body) =>
              mutate(
                editingRule ? `/admin/reward-rules/${editingRule.id}` : '/admin/reward-rules',
                editingRule ? 'PATCH' : 'POST',
                body,
                editingRule ? 'Rule saved.' : 'Rule created — it fires on its trigger now.',
              )
            }
          />
        </TabsContent>

        <TabsContent value="achievements" className="space-y-3 pt-2">
          <p className="text-sm text-muted-foreground">
            Badge text and payouts are editable here; unlock conditions stay code-driven.
          </p>
          {!achievements.data ? (
            <LoadingState title="Loading achievements…" />
          ) : achievements.data.items.length === 0 ? (
            <EmptyState title="No achievements" description="Seed achievements first." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Badge</th>
                    <th className="px-3 py-2 font-medium">Points</th>
                    <th className="px-3 py-2 font-medium">Unlocks</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {achievements.data.items.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-3 py-2">
                        <span className="block font-medium">{row.name}</span>
                        <span className="block font-metric text-xs text-muted-foreground">
                          {row.key}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-metric">{row.points}</td>
                      <td className="px-3 py-2 font-metric">{row.unlockCount}</td>
                      <td className="px-3 py-2">
                        <Badge variant={row.isActive ? 'success' : 'secondary'}>
                          {row.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingAchievement(row)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              mutate(
                                `/admin/achievements/${row.id}`,
                                'PATCH',
                                { isActive: !row.isActive },
                                'Achievement updated.',
                              )
                            }
                          >
                            {row.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {editingAchievement ? (
            <AchievementDialog
              key={editingAchievement.id}
              initial={editingAchievement}
              open
              onOpenChange={(open) => {
                if (!open) {
                  setEditingAchievement(null);
                }
              }}
              onSave={(body) =>
                mutate(
                  `/admin/achievements/${editingAchievement.id}`,
                  'PATCH',
                  body,
                  'Achievement saved.',
                )
              }
            />
          ) : null}
        </TabsContent>

        <TabsContent value="redemptions" className="space-y-3 pt-2">
          {!redemptions.data ? (
            <LoadingState title="Loading redemptions…" />
          ) : redemptions.data.items.length === 0 ? (
            <EmptyState title="No redemptions" description="Redemption requests appear here." />
          ) : (
            <div className="space-y-2">
              {redemptions.data.items.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm"
                >
                  <span className="font-medium">{row.rewardName}</span>
                  <Badge variant="outline">{row.status}</Badge>
                  <span className="font-metric text-muted-foreground">{row.pointsCost} pts</span>
                  <span className="ml-auto flex gap-1">
                    {(row.status === 'PENDING' || row.status === 'PROCESSING') && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            mutate(
                              `/admin/reward-redemptions/${row.id}`,
                              'PATCH',
                              { status: 'FULFILLED' },
                              'Redemption fulfilled.',
                            )
                          }
                        >
                          Fulfill
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            mutate(
                              `/admin/reward-redemptions/${row.id}`,
                              'PATCH',
                              { status: 'CANCELLED' },
                              'Redemption cancelled and refunded.',
                            )
                          }
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="suspicious" className="space-y-3 pt-2">
          {!suspicious.data ? (
            <LoadingState title="Loading signals…" />
          ) : suspicious.data.items.length === 0 ? (
            <EmptyState
              title="Nothing flagged"
              description="Abuse signals appear here for review — never auto-ban."
            />
          ) : (
            <div className="space-y-2">
              {suspicious.data.items.map((row) => (
                <Card key={`${row.userId}-${row.signal}`}>
                  <CardContent className="p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-card-title">{row.displayName}</CardTitle>
                      <Badge variant="warning">{row.signal.replace(/-/g, ' ')}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">{row.detail}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="adjust" className="pt-2">
          <Card>
            <CardContent className="space-y-3 p-6">
              <CardTitle className="text-card-title">Manual point adjustment</CardTitle>
              <p className="text-sm text-muted-foreground">
                Every adjustment writes a ledger transaction with your admin identity. Negative
                adjustments cannot take a balance below zero.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="adjust-user">User ID</Label>
                  <Input
                    id="adjust-user"
                    value={adjustUser}
                    onChange={(event) => setAdjustUser(event.target.value)}
                    placeholder="uuid"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adjust-amount">Amount (signed, ≠ 0)</Label>
                  <Input
                    id="adjust-amount"
                    inputMode="numeric"
                    value={adjustAmount}
                    onChange={(event) => setAdjustAmount(event.target.value)}
                    placeholder="100 or -50"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adjust-reason">Reason (required)</Label>
                <Textarea
                  id="adjust-reason"
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value)}
                  rows={2}
                />
              </div>
              <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
                <DialogTrigger asChild>
                  <Button
                    disabled={adjustUser.trim().length === 0 || adjustReason.trim().length < 5}
                  >
                    Review adjustment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirm adjustment</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Apply <span className="font-metric font-bold">{adjustAmount}</span> points to{' '}
                    <span className="font-metric">{adjustUser}</span> for “{adjustReason}”?
                  </p>
                  <Button
                    onClick={() => {
                      mutate(
                        `/admin/users/${adjustUser.trim()}/points/adjust`,
                        'POST',
                        { amount: Number(adjustAmount), reason: adjustReason.trim() },
                        'Adjustment applied.',
                      );
                      setAdjustOpen(false);
                    }}
                  >
                    Confirm
                  </Button>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
