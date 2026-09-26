import { pageMetadata } from '@/lib/metadata';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/layout/page-container';
import { RequireAuth } from '@/components/auth/require-auth';
import { ChallengeArena, ChallengeHistorySection } from '@/components/challenge/challenge-arena';

export const metadata = pageMetadata('Challenge', 'Head-to-head aptitude challenges on ApteeZ.');

export default function ChallengePage(): React.JSX.Element {
  return (
    <PageStack>
      <PageHeader
        title="Challenge"
        description="Pick a domain and duel a live opponent. +1 per correct answer, −1 per wrong."
      />
      <RequireAuth>
        <ChallengeArena />
        <ChallengeHistorySection />
      </RequireAuth>
    </PageStack>
  );
}
