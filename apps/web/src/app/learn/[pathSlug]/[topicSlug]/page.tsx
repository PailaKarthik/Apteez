import { pageMetadata } from '@/lib/metadata';
import { PageStack } from '@/components/layout/page-container';
import { LearningTopicView } from '@/components/learning/topic-view';

export const metadata = pageMetadata('Learn', 'Structured aptitude learning on ApteeZ.');

interface LearnTopicPageProps {
  params: { pathSlug: string; topicSlug: string };
}

export default function LearnTopicPage({ params }: LearnTopicPageProps): React.JSX.Element {
  return (
    <PageStack>
      <LearningTopicView slug={params.topicSlug} />
    </PageStack>
  );
}
