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
        title="Contribute"
        description="Help grow the library. Every submission passes human review before it reaches solvers."
      />
      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          {STATUS_ORDER.map((status, index) => (
            <div key={status} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {index + 1}
              </span>
              <div>
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
