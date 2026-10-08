import { ArrowRight, BookOpenCheck, GraduationCap, Route, UploadCloud } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@apteez/ui';
import { pageMetadata } from '@/lib/metadata';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/layout/page-container';
import { ComingSoonHero } from '@/components/shared/coming-soon-hero';

export const metadata = pageMetadata('Explore', 'Upload and take courses on ApteeZ — coming soon.');

const PLANNED = [
  {
    icon: UploadCloud,
    title: 'Instructor uploads',
    description: 'Publish structured courses with lessons, examples and practice sets.',
  },
  {
    icon: Route,
    title: 'Guided paths',
    description: 'Follow a syllabus from fundamentals to exam-ready, step by step.',
  },
  {
    icon: BookOpenCheck,
    title: 'Course practice',
    description: 'Every lesson links straight into the live question library.',
  },
];

function OrbitVisual(): React.JSX.Element {
  return (
    <div className="relative mx-auto flex size-56 items-center justify-center" aria-hidden>
      <span className="conic-ring absolute inset-0 rounded-full opacity-40 blur-[2px]" />
      <span className="absolute inset-2 rounded-full border border-white/15" />
      <span className="absolute inset-6 rounded-full border border-dashed border-white/20 animate-spin-slow" />
      <span className="glass flex size-24 items-center justify-center rounded-3xl border border-white/20 shadow-2xl">
        <GraduationCap className="size-11 text-white" />
      </span>
      <span className="animate-float absolute -top-1 left-6 flex size-11 items-center justify-center rounded-2xl border border-white/20 bg-primary/40 backdrop-blur">
        <UploadCloud className="size-5 text-white" />
      </span>
      <span className="animate-float-slow absolute bottom-2 right-4 flex size-11 items-center justify-center rounded-2xl border border-white/20 bg-primary/25 backdrop-blur">
        <BookOpenCheck className="size-5 text-white" />
      </span>
      <span className="animate-float absolute bottom-8 left-2 flex size-9 items-center justify-center rounded-xl border border-white/20 bg-accent-foreground/30 backdrop-blur [animation-delay:-2s]">
        <Route className="size-4 text-white" />
      </span>
    </div>
  );
}

/**
 * Explore is reserved for user-uploaded courses. Nothing has started here —
 * the page is fully Coming Soon with no half-wired surfaces.
 */
export default function ExplorePage(): React.JSX.Element {
  return (
    <PageStack>
      <PageHeader
        eyebrow="Courses · Community · Soon"
        title="Explore"
        description="Courses uploaded by educators and the community."
      />
      <ComingSoonHero
        variant="cosmic"
        eyebrow="Course universe"
        title={
          <>
            Courses are <span className="gradient-text-cool">coming to Explore.</span>
          </>
        }
        description="Upload your own courses, follow guided paths and practice alongside every lesson. Course uploads have not started yet — this page stays as its home until the feature ships. Meanwhile the Home page folders and problem library are fully live."
        visual={<OrbitVisual />}
        actions={
          <>
            <Button asChild className="btn-sheen shadow-xl shadow-primary/30">
              <Link href="/">
                Browse the library
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button
              variant="outline"
              asChild
              className="border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20 hover:text-white"
            >
              <Link href="/challenge">Practice meanwhile</Link>
            </Button>
          </>
        }
        perks={PLANNED}
      />
    </PageStack>
  );
}
