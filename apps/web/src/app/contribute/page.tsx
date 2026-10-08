import { PenLine, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge, Card, CardContent, CardDescription, CardTitle } from '@apteez/ui';
import { CONTRIBUTION_STATUS_INFO } from '@apteez/config';
import type { ContributionStatus } from '@apteez/types';
import { ContributeWorkspace } from '@/components/contribute/contribute-workspace';
import { RequireAuth } from '@/components/auth/require-auth';
import { pageMetadata } from '@/lib/metadata';
import { PageHeader } from '@/components/shared/page-header';

export const metadata = pageMetadata(
  'Contribute',
  'Submit original aptitude questions to the ApteeZ library.',
);

const STATUS_ORDER: ContributionStatus[] = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];

const STATUS_TONE: Record<ContributionStatus, 'warning' | 'secondary' | 'success' | 'destructive'> =
  {
    PENDING: 'warning',
    UNDER_REVIEW: 'secondary',
    APPROVED: 'success',
    REJECTED: 'destructive',
  };

export default function ContributePage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Authors welcome"
        title="Contribute"
        description="Help grow the library. Every submission passes human review before it reaches solvers."
      />
      <div className="page-enter relative overflow-hidden rounded-3xl border border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.13] via-card to-card" aria-hidden />
        <div className="aurora-field" aria-hidden>
          <span className="aurora-orb -left-14 -top-20 size-64 bg-primary/30" />
          <span className="aurora-orb right-[8%] top-[-50%] size-56 bg-primary/20 [animation-delay:-5s]" />
          <span className="dot-grid absolute inset-0 opacity-60" />
        </div>
        <div className="relative space-y-3 p-6 sm:p-7">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Write the questions you wish you had
          </p>
          <h2 className="max-w-2xl text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Your question could be someone&apos;s <span className="gradient-text">breakthrough</span>
          </h2>
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            {[
              { icon: PenLine, label: 'Original questions only' },
              { icon: ShieldCheck, label: 'Reviewed by humans' },
              { icon: Sparkles, label: 'Published under your name' },
            ].map((perk) => (
              <span
                key={perk.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1.5 font-medium text-muted-foreground backdrop-blur"
              >
                <perk.icon className="size-3.5 text-primary" aria-hidden />
                {perk.label}
              </span>
            ))}
          </div>
        </div>
        <div
          className="relative h-1 bg-gradient-to-r from-primary via-accent-foreground to-primary"
          aria-hidden
        />
      </div>
      <Card className="page-enter-1 overflow-hidden">
        <span className="block h-1 bg-gradient-to-r from-primary via-accent-foreground to-primary" aria-hidden />
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          {STATUS_ORDER.map((status, index) => (
            <div
              key={status}
              className="card-lift animate-fade-up flex gap-3 rounded-xl border border-border bg-card p-3"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/50 font-metric text-sm font-extrabold text-primary">
                {index + 1}
              </span>
              <div className="min-w-0">
                <Badge variant={STATUS_TONE[status]}>
                  {CONTRIBUTION_STATUS_INFO[status].label}
                </Badge>
                <CardTitle className="sr-only">{CONTRIBUTION_STATUS_INFO[status].label}</CardTitle>
                <CardDescription className="mt-1.5 text-xs leading-relaxed">
                  {CONTRIBUTION_STATUS_INFO[status].description}
                </CardDescription>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <RequireAuth>
        <ContributeWorkspace />
      </RequireAuth>
    </div>
  );
}
