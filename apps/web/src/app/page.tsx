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
      <div
        className="animate-fade-in space-y-3"
        aria-busy="true"
        aria-label="Loading problem library"
      >
        <div className="loading-rail h-1" aria-hidden>
          <span />
        </div>
        <div className="skeleton-shine h-12 rounded-2xl" />
        <div className="overflow-hidden rounded-2xl border border-border">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border p-3 last:border-0">
              <div className="skeleton-shine size-9 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton-shine h-4 w-2/5 rounded-md" />
                <div className="skeleton-shine h-3 w-3/5 rounded-md" />
              </div>
              <div className="skeleton-shine h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
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
