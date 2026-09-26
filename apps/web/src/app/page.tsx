import dynamic from 'next/dynamic';
import { pageMetadata } from '@/lib/metadata';
import { PageStack } from '@/components/layout/page-container';
import { ExamPatterns } from '@/components/home/exam-patterns';
import { HomeGreeting } from '@/components/home/home-greeting';
import { PracticeAreas } from '@/components/home/practice-areas';

export const metadata = pageMetadata(
  'Home',
  'ApteeZ home — exam patterns, practice areas and the problem library.',
);

// Below-the-fold library is the heaviest home chunk (filters + infinite
// cursor table + favorites). Code-split it so first paint only pays for
// greeting + folders + areas; the table streams in with its own skeleton.
const ProblemLibrary = dynamic(
  () => import('@/components/home/problem-library').then((m) => m.ProblemLibrary),
  {
    loading: () => (
      <div className="space-y-3" aria-busy="true" aria-label="Loading problem library">
        <div className="h-10 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    ),
  },
);

export default function HomePage(): React.JSX.Element {
  return (
    <PageStack>
      <HomeGreeting />
      <ExamPatterns />
      <PracticeAreas />
      <ProblemLibrary />
    </PageStack>
  );
}
