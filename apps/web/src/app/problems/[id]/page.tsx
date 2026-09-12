import { pageMetadata } from '@/lib/metadata';
import { PageStack } from '@/components/layout/page-container';
import { PracticeView } from '@/components/problems/practice-view';

export const metadata = pageMetadata('Practice', 'Practise an aptitude problem on ApteeZ.');

interface ProblemPageProps {
  params: { id: string };
}

export default function ProblemPage({ params }: ProblemPageProps): React.JSX.Element {
  return (
    <PageStack>
      <PracticeView problemId={params.id} />
    </PageStack>
  );
}
