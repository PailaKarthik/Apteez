import { CalendarCheck, Flame, Gift, Target } from 'lucide-react';
import Link from 'next/link';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  ComingSoonBadge,
  ProgressRing,
} from '@apteez/ui';
import { pageMetadata } from '@/lib/metadata';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/layout/page-container';

export const metadata = pageMetadata(
  'Weekly Targets',
  'Set weekly aptitude targets and earn points — coming soon to ApteeZ.',
);

const PLANNED = [
  {
    icon: Target,
    title: 'Set solve-count goals',
    description: 'Pick how many questions to solve each week, per topic or overall.',
  },
  {
    icon: Flame,
    title: 'Protect your streak',
    description: 'Daily practice keeps the streak alive; targets keep it meaningful.',
  },
  {
    icon: Gift,
    title: 'Earn points on completion',
    description: 'Hit 100% of a weekly target to bank points toward rewards.',
  },
  {
    icon: CalendarCheck,
    title: 'Review every Sunday',
    description: 'A weekly recap shows what moved your rating and what to fix.',
  },
];

export default function TargetsPage(): React.JSX.Element {
  return (
    <PageStack>
      <PageHeader
        title="Weekly Targets"
        description="A personal area for goal-setting — kept visible in navigation, launching later."
      />

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-start gap-5 bg-gradient-to-br from-warning/10 via-card to-card p-6 sm:p-10">
          <ComingSoonBadge />
          <div className="flex w-full flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl space-y-3">
              <h2 className="text-section-title text-foreground sm:text-2xl">
                Goals that turn practice into progress.
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                Weekly Targets will let you set solve-count goals, track them through the week and
                earn points for completing them. Target functionality is intentionally inactive in
                this release — this page stays as its home until the feature ships.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4 rounded-2xl border border-border bg-elevated p-4">
              <ProgressRing value={0} size={64} strokeWidth={6} />
              <div>
                <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                  This week
                </p>
                <p className="text-stat text-foreground">
                  0<span className="text-sm font-medium text-muted-foreground">/0 solved</span>
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/challenge">Practice meanwhile</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/contribute">Contribute questions</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {PLANNED.map((item) => (
          <Card key={item.title}>
            <CardContent className="flex gap-4 p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
                <item.icon className="size-5" aria-hidden />
              </span>
              <div>
                <CardTitle className="text-card-title">{item.title}</CardTitle>
                <CardDescription className="mt-1">{item.description}</CardDescription>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageStack>
  );
}
