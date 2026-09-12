import { pageMetadata } from '@/lib/metadata';
import { PageStack } from '@/components/layout/page-container';
import { LearningPathView } from '@/components/learning/path-view';

export const metadata = pageMetadata('Learn', 'Structured aptitude learning on ApteeZ.');

interface LearnPathPageProps {
  params: { pathSlug: string };
}

export default function LearnPathPage({ params }: LearnPathPageProps): React.JSX.Element {
  return (
    <PageStack>
      <LearningPathView slug={params.pathSlug} />
    </PageStack>
  );
}
