import { pageMetadata } from '@/lib/metadata';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/layout/page-container';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@apteez/ui';
import { ProblemBrowser } from '@/components/problems/problem-browser';
import { LearningPaths } from '@/components/learning/learning-paths';
import type { ProblemFilters } from '@/hooks/use-problems';

export const metadata = pageMetadata(
  'Explore',
  'Explore the ApteeZ question library and learning paths.',
);

interface ExplorePageProps {
  searchParams: { category?: string; exam?: string; difficulty?: string; sort?: string };
}

export default function ExplorePage({ searchParams }: ExplorePageProps): React.JSX.Element {
  const initialFilters: ProblemFilters = {
    ...(searchParams.category ? { category: searchParams.category } : {}),
    ...(searchParams.exam ? { exam: searchParams.exam } : {}),
    ...(searchParams.difficulty ? { difficulty: searchParams.difficulty } : {}),
    ...(searchParams.sort ? { sort: searchParams.sort } : {}),
  };

  return (
    <PageStack>
      <PageHeader
        title="Explore"
        description="Learn aptitude topics then test yourself against the question library."
      />
      <Tabs defaultValue="learn">
        <TabsList aria-label="Explore content">
          <TabsTrigger value="learn">Learn</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
        </TabsList>
        <TabsContent value="learn" className="pt-6">
          <LearningPaths />
        </TabsContent>
        <TabsContent value="questions" className="pt-6">
          <ProblemBrowser initialFilters={initialFilters} />
        </TabsContent>
      </Tabs>
    </PageStack>
  );
}
