import { pageMetadata } from '@/lib/metadata';
import { ContestDrafts } from '@/components/contests/contest-drafts';
import { ContestWizard } from '@/components/contests/contest-wizard';

export const metadata = pageMetadata(
  'New contest',
  'Create a contest: format first, questions next.',
);

export default function NewContestPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <ContestDrafts />
      <ContestWizard />
    </div>
  );
}
