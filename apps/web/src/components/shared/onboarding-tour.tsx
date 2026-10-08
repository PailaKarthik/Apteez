'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Gift,
  PartyPopper,
  Search,
  Swords,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { Button, cn } from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';

const STORAGE_KEY = 'apteez:onboarding-v2';
const PAD = 8;

interface TourStep {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  /** Selectors tried in order — desktop sidebar first, mobile tab bar next. */
  targets: string[];
}

const STEPS: TourStep[] = [
  {
    icon: PartyPopper,
    eyebrow: 'Quick tour',
    title: 'Welcome to ApteeZ',
    description:
      'Your competitive aptitude arena. Let us point out the important tabs — thirty seconds, skip anytime.',
    targets: [],
  },
  {
    icon: Swords,
    eyebrow: 'Tab · Challenge',
    title: 'Duel live opponents',
    description:
      'This tab is your 1v1 battlefield. Pick a domain and face a real opponent — +1 per correct answer, −1 per wrong one, rating on the line.',
    targets: ['aside a[href="/challenge"]', 'nav[aria-label="Primary"] a[href="/challenge"]'],
  },
  {
    icon: Trophy,
    eyebrow: 'Tab · Contests',
    title: 'Compete on schedule',
    description:
      'This tab hosts scheduled contests and events. Register early, enter when the countdown hits zero, and climb the live standings.',
    targets: ['aside a[href="/contests"]', 'nav[aria-label="Primary"] a[href="/contests"]'],
  },
  {
    icon: Search,
    eyebrow: 'Top bar · Search',
    title: 'Jump anywhere instantly',
    description:
      'This search reaches every corner — problems, topics, contests, events and discussions — with suggestions as you type.',
    targets: ['header input[type="search"]'],
  },
  {
    icon: Gift,
    eyebrow: 'Tab · Rewards',
    title: 'Streaks turn into rewards',
    description:
      'This tab is your vault. Solve daily to grow streaks, bank points from duels and contests, and redeem them for rewards.',
    targets: ['aside a[href="/rewards"]'],
  },
];

interface Geometry {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** First visible match wins; invisible (mobile-hidden / desktop-hidden) nodes are skipped. */
function resolveTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (node instanceof HTMLElement) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return node;
      }
    }
  }
  return null;
}

function measure(node: HTMLElement): Geometry {
  const rect = node.getBoundingClientRect();
  return {
    top: Math.max(4, rect.top - PAD),
    left: Math.max(4, rect.left - PAD),
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };
}

/**
 * Spotlight walkthrough for first-login users: the current step's real tab
 * (or bar) is cut out of a dimmed overlay with a glowing ring, and a small
 * dialog anchored beside it explains the section. Steps glide from one
 * target to the next; missing targets (e.g. desktop-only rails on a phone)
 * gracefully fall back to a centered card.
 *
 * Shows once per device, only for signed-in users. Skipping or finishing
 * remembers the choice permanently.
 */
export function OnboardingTour(): React.JSX.Element | null {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [geom, setGeom] = React.useState<Geometry | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (isLoading || !user) {
      return;
    }
    let seen = false;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      seen = true;
    }
    if (seen) {
      return;
    }
    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [isLoading, user]);

  // Lock page scroll while the tour owns the screen.
  React.useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open ]);

  // Re-aim the spotlight on open, on step change, and on resize. The
  // delayed re-measure lets smooth scrolling settle before we lock on.
  React.useEffect(() => {
    if (!open) {
      return;
    }
    const current = STEPS[step] ?? STEPS[0];
    const aim = (): void => {
      const node = resolveTarget(current.targets);
      setGeom(node ? measure(node) : null);
    };
    const first = resolveTarget(current.targets);
    if (first) {
      first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    aim();
    const timer = window.setTimeout(aim, 450);
    window.addEventListener('resize', aim);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', aim);
    };
  }, [open, step]);

  const dismiss = React.useCallback((remember: boolean) => {
    if (remember) {
      try {
        window.localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // Storage unavailable — the tour simply shows again next visit.
      }
    }
    setOpen(false);
  }, []);

  const finish = React.useCallback(() => {
    dismiss(true);
    router.push('/challenge');
  }, [dismiss, router]);

  if (!mounted || !user || !open) {
    return null;
  }

  const current = STEPS[step] ?? STEPS[0];
  const last = step >= STEPS.length - 1;
  const Icon = current.icon;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  // Tooltip placement: below the highlight, or above it when the target
  // sits in the lower half of the screen. Horizontally clamped to the
  // viewport with the arrow tracking the target's center.
  const TOOLTIP_W = Math.min(340, viewportW - 24);
  let tipTop: number | null = null;
  let tipLeft = Math.round((viewportW - TOOLTIP_W) / 2);
  let above = false;
  let arrowX = TOOLTIP_W / 2;
  if (geom) {
    above = geom.top > viewportH * 0.55;
    tipLeft = Math.round(Math.min(Math.max(12, geom.left), viewportW - TOOLTIP_W - 12));
    const centerX = geom.left + geom.width / 2;
    arrowX = Math.round(Math.min(Math.max(28, centerX - tipLeft), TOOLTIP_W - 28));
    tipTop = above ? null : Math.round(geom.top + geom.height + 14);
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="ApteeZ quick tour">
      {geom ? (
        <>
          {/* Dimmed world with a real cutout: the highlight box punches its
              own hole via an oversized shadow, so the tab stays bright. */}
          <div className="pointer-events-none absolute inset-0 animate-fade-in" aria-hidden>
            <div
              className="absolute rounded-2xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                top: geom.top,
                left: geom.left,
                width: geom.width,
                height: geom.height,
                boxShadow: '0 0 0 9999px hsl(var(--background) / 0.72)',
              }}
            />
            <div
              className="absolute rounded-2xl ring-2 ring-primary transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                top: geom.top,
                left: geom.left,
                width: geom.width,
                height: geom.height,
                boxShadow:
                  '0 0 32px -4px hsl(var(--primary) / 0.65), inset 0 0 18px -8px hsl(var(--primary) / 0.5)',
              }}
            />
            <span
              className="absolute transition-all duration-500"
              style={{ top: geom.top - 5, left: geom.left + geom.width - 5 }}
            >
              <span className="live-dot" />
            </span>
          </div>
          {/* Anchored explainer card. */}
          <div
            key={step}
            className={cn(
              'absolute animate-fade-up rounded-2xl border border-border bg-card p-5 shadow-2xl shadow-primary/20',
              above && '-translate-y-full',
            )}
            style={{
              width: TOOLTIP_W,
              left: tipLeft,
              ...(above ? { top: geom.top - 14 } : { top: tipTop ?? 0 }),
            }}
          >
            <span
              className="absolute size-3 rotate-45 border-border bg-card"
              aria-hidden
              style={{
                left: arrowX - 6,
                ...(above
                  ? { bottom: -7, borderRightWidth: 1, borderBottomWidth: 1 }
                  : { top: -7, borderLeftWidth: 1, borderTopWidth: 1 }),
              }}
            />
            <TourBody
              icon={<Icon className="size-6" aria-hidden />}
              eyebrow={current.eyebrow}
              title={current.title}
              description={current.description}
              step={step}
              last={last}
              onBack={() => setStep((s) => Math.max(0, s - 1))}
              onNext={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              onSkip={() => dismiss(true)}
              onFinish={finish}
            />
          </div>
        </>
      ) : (
        <>
          <div className="absolute inset-0 animate-fade-in bg-background/70" aria-hidden />
          <div
            key={step}
            className="absolute left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-2xl border border-border bg-card p-5 shadow-2xl shadow-primary/20 sm:p-6"
          >
            <TourBody
              icon={<Icon className="size-7" aria-hidden />}
              eyebrow={current.eyebrow}
              title={current.title}
              description={current.description}
              step={step}
              last={last}
              onBack={() => setStep((s) => Math.max(0, s - 1))}
              onNext={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              onSkip={() => dismiss(true)}
              onFinish={finish}
            />
          </div>
        </>
      )}
    </div>
  );
}

function TourBody({
  icon,
  eyebrow,
  title,
  description,
  step,
  last,
  onBack,
  onNext,
  onSkip,
  onFinish,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  step: number;
  last: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onFinish: () => void;
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="icon-tile size-11 shrink-0" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 pt-0.5">
          <span className="block text-metadata uppercase tracking-[0.18em] text-primary">
            {eyebrow} · {step + 1}/{STEPS.length}
          </span>
          <span className="mt-1 block text-lg font-extrabold tracking-tight text-foreground">
            {title}
          </span>
        </span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="flex items-center gap-1.5" aria-hidden>
        {STEPS.map((_, index) => (
          <span
            key={index}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              index === step ? 'w-6 bg-primary' : index < step ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted',
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        {step > 0 ? (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft aria-hidden />
            Back
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip tour
          </Button>
        )}
        {last ? (
          <Button onClick={onFinish} className="btn-sheen shadow-lg shadow-primary/25">
            Start practicing
            <ArrowRight aria-hidden />
          </Button>
        ) : (
          <Button onClick={onNext} className="btn-sheen">
            Next
            <ArrowRight aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
