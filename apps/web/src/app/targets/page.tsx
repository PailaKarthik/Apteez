import { CalendarCheck, Flame, Gift, Target } from 'lucide-react';
import Link from 'next/link';
import { Button, ProgressRing } from '@apteez/ui';
import { pageMetadata } from '@/lib/metadata';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/layout/page-container';
import { ComingSoonHero } from '@/components/shared/coming-soon-hero';

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

function TargetVisual(): React.JSX.Element {
  return (
    <div className="glass flex items-center gap-5 rounded-2xl border border-white/20 p-5 shadow-2xl">
      <span className="relative" aria-hidden>
        <ProgressRing value={72} size={84} strokeWidth={8} />
        <span className="absolute inset-0 flex items-center justify-center font-metric text-sm font-extrabold text-white">
          72%
        </span>
      </span>
      <span>
        <span className="block text-metadata uppercase tracking-[0.16em] text-white/70">
          This week
        </span>
        <span className="mt-1 block font-metric text-2xl font-extrabold text-white">
          18<span className="text-sm font-medium text-white/60">/25 solved</span>
        </span>
        <span className="mt-1.5 block h-1.5 w-32 overflow-hidden rounded-full bg-white/15">
          <span className="block h-full w-[72%] animate-gradient-pan rounded-full bg-gradient-to-r from-primary via-accent-foreground to-primary bg-[length:200%_auto]" />
        </span>
      </span>
    </div>
  );
}

export default function TargetsPage(): React.JSX.Element {
  return (
    <PageStack>
      <PageHeader
        eyebrow="Goals · Streaks · Glory"
        title="Weekly Targets"
        description="A personal area for goal-setting — kept visible in navigation, launching later."
      />

      <ComingSoonHero
        variant="cosmic"
        eyebrow="Goal engine"
        title={
          <>
            Goals that turn practice <span className="gradient-text-cool">into progress.</span>
          </>
        }
        description="Weekly Targets will let you set solve-count goals, track them through the week and earn points for completing them. Target functionality is intentionally inactive in this release — this page stays as its home until the feature ships."
        visual={<TargetVisual />}
        actions={
          <>
            <Button asChild className="btn-sheen shadow-xl shadow-primary/30">
              <Link href="/challenge">Practice meanwhile</Link>
            </Button>
            <Button
              variant="outline"
              asChild
              className="border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white"
            >
              <Link href="/contribute">Contribute questions</Link>
            </Button>
          </>
        }
        perks={PLANNED}
      />
    </PageStack>
  );
}
