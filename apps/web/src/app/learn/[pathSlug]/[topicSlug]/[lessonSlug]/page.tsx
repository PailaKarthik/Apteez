import { pageMetadata } from '@/lib/metadata';
import { PageStack } from '@/components/layout/page-container';
import { LearningLessonView } from '@/components/learning/lesson-view';

export const metadata = pageMetadata('Lesson', 'Study an ApteeZ aptitude lesson.');

interface LearnLessonPageProps {
  params: { pathSlug: string; topicSlug: string; lessonSlug: string };
}

export default function LearnLessonPage({ params }: LearnLessonPageProps): React.JSX.Element {
  return (
    <PageStack>
      <LearningLessonView topicSlug={params.topicSlug} lessonSlug={params.lessonSlug} />
    </PageStack>
  );
}
