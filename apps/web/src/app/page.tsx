import { pageMetadata } from '@/lib/metadata';
import { PageStack } from '@/components/layout/page-container';
import { ArenaGrid } from '@/components/home/arena-grid';
import { ExamStrip } from '@/components/home/exam-strip';
import { Hero } from '@/components/home/hero';
import { PersonalRow } from '@/components/home/personal-row';
import { ProblemFeed } from '@/components/home/problem-feed';
import { SectionHeader } from '@apteez/ui';
import { StatusCard } from '@/components/home/status-card';

export const metadata = pageMetadata(
  'Home',
  'ApteeZ home — challenges, contests, community and contributions.',
);

export default function HomePage(): React.JSX.Element {
  return (
    <PageStack>
      <Hero />
      <ArenaGrid />
      <ProblemFeed />
      <section aria-label="Exam contexts" className="space-y-4">
        <SectionHeader
          title="Prepare by exam"
          description="Filter the library by the exams you are targeting."
        />
        <ExamStrip />
      </section>
      <PersonalRow />
      <StatusCard />
    </PageStack>
  );
}
