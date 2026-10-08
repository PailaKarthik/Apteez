import type * as React from 'react';
import { Rocket, Sparkles } from 'lucide-react';
import { Badge, Card, CardContent, cn } from '@apteez/ui';

export type ComingSoonVariant = 'cosmic' | 'luxe' | 'ember';

export interface ComingSoonPerk {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

export interface ComingSoonHeroProps {
  variant: ComingSoonVariant;
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  actions?: React.ReactNode;
  perks?: ComingSoonPerk[];
  visual?: React.ReactNode;
  className?: string;
}

interface VariantStyle {
  shell: string;
  orbA: string;
  orbB: string;
  orbC: string;
  badge: string;
  title: string;
  description: string;
  hairline: string;
}

const VARIANT_STYLES: Record<ComingSoonVariant, VariantStyle> = {
  // Explore — deep violet aurora, primary token family.
  cosmic: {
    shell: 'border-primary/25 bg-gradient-to-br from-[#1b1440] via-[#14102e] to-card dark:from-[#1b1440] dark:via-[#100c26] dark:to-card',
    orbA: 'bg-primary/40',
    orbB: 'bg-primary/25',
    orbC: 'bg-accent-foreground/25',
    badge: 'border-primary/40 bg-primary/20 text-white',
    title: 'text-white',
    description: 'text-white/70',
    hairline: 'from-transparent via-white/25 to-transparent',
  },
  // Rewards — fully violet-led: brand surfaces carry the layout, no
  // yellow tint anywhere on the page.
  luxe: {
    shell: 'border-primary/25 bg-gradient-to-br from-primary/[0.14] via-card to-card',
    orbA: 'bg-primary/25',
    orbB: 'bg-primary/20',
    orbC: 'bg-accent-foreground/15',
    badge: 'border-primary/40 bg-primary/10 text-foreground',
    title: 'text-foreground',
    description: 'text-muted-foreground',
    hairline: 'from-transparent via-primary/40 to-transparent',
  },
  // Weekly targets — warning ember glow, warning semantic token.
  ember: {
    shell: 'border-warning/25 bg-gradient-to-br from-[#2b1408] via-[#1c0f06] to-card dark:from-[#2b1408] dark:via-[#160c05] dark:to-card',
    orbA: 'bg-warning/30',
    orbB: 'bg-gold/20',
    orbC: 'bg-warning/20',
    badge: 'border-warning/40 bg-warning/15 text-warning',
    title: 'text-white',
    description: 'text-white/70',
    hairline: 'from-transparent via-white/25 to-transparent',
  },
};

/**
 * Cinematic "coming soon" hero with three distinct visual identities:
 * cosmic (Explore), luxe (Rewards), ember (Weekly Targets). Aurora orbs
 * drift behind a glass content layer; perks stagger in below.
 */
export function ComingSoonHero({
  variant,
  eyebrow,
  title,
  description,
  actions,
  perks,
  visual,
  className,
}: ComingSoonHeroProps): React.JSX.Element {
  const styles = VARIANT_STYLES[variant];
  return (
    <div className={cn('space-y-4', className)}>
      <Card className={cn('overflow-hidden', styles.shell)}>
        <CardContent className="relative overflow-hidden p-0">
          <div className="aurora-field" aria-hidden>
            <span className={cn('aurora-orb left-[-6%] top-[-30%] size-72', styles.orbA)} />
            <span
              className={cn('aurora-orb right-[-8%] top-[10%] size-80 [animation-delay:-5s]', styles.orbB)}
            />
            <span
              className={cn('aurora-orb bottom-[-45%] left-[35%] size-72 [animation-delay:-9s]', styles.orbC)}
            />
            <span className="dot-grid absolute inset-0 opacity-60" />
          </div>

          <div className="relative flex flex-col gap-6 p-6 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl space-y-4">
              <div className="page-enter flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn('gap-1.5 uppercase tracking-widest', styles.badge)}>
                  <Sparkles className="size-3" aria-hidden />
                  Coming soon
                </Badge>
                <Badge variant="outline" className={cn('gap-1.5', styles.badge)}>
                  <Rocket className="size-3" aria-hidden />
                  {eyebrow}
                </Badge>
              </div>
              <h2 className={cn('page-enter-1 text-2xl font-extrabold tracking-tight sm:text-4xl', styles.title)}>
                {title}
              </h2>
              <p className={cn('page-enter-2 max-w-lg text-sm leading-relaxed sm:text-base', styles.description)}>
                {description}
              </p>
              {actions ? <div className="page-enter-3 flex flex-wrap gap-2 pt-1">{actions}</div> : null}
            </div>
            {visual ? (
              <div className="page-enter-2 relative mx-auto w-full max-w-xs shrink-0 lg:mx-0">
                {visual}
              </div>
            ) : null}
          </div>

          <div className={cn('relative h-px bg-gradient-to-r', styles.hairline)} aria-hidden />
        </CardContent>
      </Card>

      {perks && perks.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {perks.map((perk, index) => (
            <div
              key={perk.title}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(index, 5) * 90 + 150}ms` }}
            >
              <Card className="card-lift card-shine h-full">
                <CardContent className="flex gap-4 p-5">
                  <span className="icon-tile size-11 shrink-0">
                    <perk.icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{perk.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                      {perk.description}
                    </span>
                  </span>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
