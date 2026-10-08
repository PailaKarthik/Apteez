import { pageMetadata } from '@/lib/metadata';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/layout/page-container';
import { LeaderboardBoard } from '@/components/leaderboard/leaderboard-board';

export const metadata = pageMetadata('Leaderboard', 'ApteeZ global and sectional rankings.');

export default function LeaderboardPage(): React.JSX.Element {
  return (
    <PageStack>
      <PageHeader
        eyebrow="Rankings · Season live"
        title="Leaderboard"
        description="Contest rating plus challenge ratings across the 7 aptitude sections."
      />
      <LeaderboardBoard />
    </PageStack>
  );
}
