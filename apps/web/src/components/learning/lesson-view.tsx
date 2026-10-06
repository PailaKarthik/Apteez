'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  ErrorState,
  LoadingState,
} from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';
import { useCompleteLesson, useLearningLesson } from '@/hooks/use-learning';
import { LessonContent } from './lesson-content';

const DIFFICULTY_TONE = { EASY: 'success', MEDIUM: 'warning', HARD: 'destructive' } as const;

/**
 * Full lesson page: structured blocks, practice refs, exam context and
 * prev/next navigation inside the topic. Completion is an explicit server
 * action — the button only reflects what the API returned.
 */
export function LearningLessonView({
  topicSlug,
  lessonSlug,
}: {
  topicSlug: string;
  lessonSlug: string;
}): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const lesson = useLearningLesson(topicSlug, lessonSlug);
  const complete = useCompleteLesson();

  if (lesson.isPending) {
    return <LoadingState title="Loading lesson…" />;
  }
  if (lesson.isError || !lesson.data) {
    return <ErrorState title="Could not load this lesson" onRetry={() => void lesson.refetch()} />;
  }

  const current = lesson.data;
  const { navigation } = current;
  const completed = current.progressStatus === 'COMPLETED';

  const handleComplete = (): void => {
    complete.mutate(
      { topicSlug: navigation.topicSlug, lessonSlug: current.slug },
      {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Could not complete the lesson.');
        },
      },
    );
  };

  const hrefFor = (slug: string): string =>
    `/learn/${navigation.pathSlug}/${navigation.topicSlug}/${slug}`;

  return (
    <div className="space-y-8">
      <nav
        aria-label="Breadcrumb"
        className="overflow-x-auto whitespace-nowrap text-sm text-muted-foreground"
      >
        <Link href="/explore" className="transition-colors hover:text-foreground">
          Explore
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <Link
          href={`/learn/${navigation.pathSlug}`}
          className="transition-colors hover:text-foreground"
        >
          {navigation.pathTitle}
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <Link
          href={`/learn/${navigation.pathSlug}/${navigation.topicSlug}`}
          className="transition-colors hover:text-foreground"
        >
          {navigation.topicTitle}
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="inline-block max-w-[40vw] truncate align-bottom text-foreground">
          {current.title}
        </span>
      </nav>

      <header className="space-y-4 border-b border-border pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={DIFFICULTY_TONE[current.difficulty]}>{current.difficulty}</Badge>
              {current.conceptTitle ? (
                <Badge variant="secondary">{current.conceptTitle}</Badge>
              ) : null}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {current.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {current.estimatedMinutes} min read · Lesson {navigation.position} of{' '}
              {navigation.total}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {completed ? (
              <Badge>
                <CheckCircle2 className="mr-1 size-3.5" aria-hidden />
                Completed
              </Badge>
            ) : null}
            {isAuthenticated ? (
              <Button
                onClick={handleComplete}
                disabled={completed || complete.isPending}
                aria-label="Mark lesson complete"
              >
                {complete.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 aria-hidden />
                )}
                {completed ? 'Completed' : 'Mark complete'}
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/login">Sign in to track progress</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <LessonContent blocks={current.content} />

      {current.examTags.length > 0 ? (
        <section aria-label="Relevant exams" className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Exam contexts</h2>
          <div className="flex flex-wrap gap-2">
            {current.examTags.map((tag) => (
              <Badge key={tag.id} variant="outline">
                {tag.name}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}

      {current.practice.length > 0 ? (
        <section aria-label="Practice problems" className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <PencilLine className="size-5 text-primary" aria-hidden />
            Practice
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {current.practice.map((ref) => (
              <Card
                key={ref.problemId}
                className="transition-colors duration-fast hover:border-primary/50"
              >
                <CardContent className="flex flex-col gap-2 p-4">
                  <CardDescription className="line-clamp-2">{ref.problemTitle}</CardDescription>
                  <Button asChild variant="outline" size="sm" className="mt-auto w-fit">
                    <Link href={`/problems/${ref.problemId}`}>Open question</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <nav
        aria-label="Lesson navigation"
        className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between"
      >
        {navigation.prevLesson ? (
          <Button asChild variant="outline">
            <Link href={hrefFor(navigation.prevLesson.slug)}>
              <ArrowLeft aria-hidden />
              Previous
            </Link>
          </Button>
        ) : (
          <span aria-hidden />
        )}
        <Button asChild variant="outline">
          <Link href={`/learn/${navigation.pathSlug}/${navigation.topicSlug}`}>All lessons</Link>
        </Button>
        {navigation.nextLesson ? (
          <Button asChild>
            <Link href={hrefFor(navigation.nextLesson.slug)}>
              Next
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : (
          <span aria-hidden />
        )}
      </nav>
    </div>
  );
}
