import { ArrowRight, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, CardContent, ComingSoonBadge } from '@apteez/ui';
import { pageMetadata } from '@/lib/metadata';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/layout/page-container';

export const metadata = pageMetadata('Explore', 'Upload and take courses on ApteeZ — coming soon.');

const PLANNED = [
  {
    title: 'Instructor uploads',
    description: 'Publish structured courses with lessons, examples and practice sets.',
  },
  {
    title: 'Guided paths',
    description: 'Follow a syllabus from fundamentals to exam-ready, step by step.',
  },
  {
    title: 'Course practice',
    description: 'Every lesson links straight into the live question library.',
  },
];

/**
 * Explore is reserved for user-uploaded courses. Nothing has started here —
 * the page is fully Coming Soon with no half-wired surfaces.
 */
export default function ExplorePage(): React.JSX.Element {
  return (
    <PageStack>
      <PageHeader title="Explore" description="Courses uploaded by educators and the community." />
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-start gap-5 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-10">
          <ComingSoonBadge />
          <div className="max-w-xl space-y-3">
            <h2 className="flex items-center gap-2 text-section-title text-foreground sm:text-2xl">
              <GraduationCap className="size-6 text-primary" aria-hidden />
              Courses are coming to Explore.
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Upload your own courses, follow guided paths and practice alongside every lesson.
              Course uploads have not started yet — this page stays as its home until the feature
              ships. Meanwhile the Home page folders and problem library are fully live.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/">
                Browse the library
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/challenge">Practice meanwhile</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {PLANNED.map((item) => (
          <Card key={item.title}>
            <CardContent className="space-y-1.5 p-5">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageStack>
  );
}
