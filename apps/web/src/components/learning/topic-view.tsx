'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle, PlayCircle } from 'lucide-react';
import { Card, CardContent, ErrorState, LoadingState, Progress } from '@apteez/ui';
import { useLearningTopic } from '@/hooks/use-learning';

/** Lesson row with a visual status that is never colour-only. */
function LessonRow({
  pathSlug,
  topicSlug,
  lesson,
}: {
  pathSlug: string;
  topicSlug: string;
  lesson: {
    id: string;
    slug: string;
    title: string;
    order: number;
    estimatedMinutes: number;
    hasPractice: boolean;
    progressStatus?: 'STARTED' | 'COMPLETED';
  };
}): React.JSX.Element {
  const statusLabel =
    lesson.progressStatus === 'COMPLETED'
      ? 'Completed'
      : lesson.progressStatus === 'STARTED'
        ? 'In progress'
        : 'Not started';
  const StatusIcon =
    lesson.progressStatus === 'COMPLETED'
      ? CheckCircle2
      : lesson.progressStatus === 'STARTED'
        ? PlayCircle
        : Circle;

  return (
    <li>
      <Link
        href={`/learn/${pathSlug}/${topicSlug}/${lesson.slug}`}
        className="flex items-center gap-4 rounded-xl border border-border bg-elevated p-4 transition-colors duration-fast hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg border font-mono text-sm font-semibold ${
            lesson.progressStatus === 'COMPLETED'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-background text-muted-foreground'
          }`}
        >
          {lesson.order + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground">{lesson.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1" aria-label={`Status: ${statusLabel}`}>
              <StatusIcon
                className={`size-3.5 ${
                  lesson.progressStatus === 'COMPLETED' ? 'text-primary' : 'text-muted-foreground'
                }`}
                aria-hidden
              />
              {statusLabel}
            </span>
            <span aria-hidden>·</span>
            <span>
              {lesson.estimatedMinutes} min{lesson.hasPractice ? ' · includes practice' : ''}
            </span>
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

/** Lessons inside one topic in reading order, with progress affordances. */
export function LearningTopicView({ slug }: { slug: string }): React.JSX.Element {
  const topic = useLearningTopic(slug);

  if (topic.isPending) {
    return <LoadingState title="Loading topic…" />;
  }
  if (topic.isError || !topic.data) {
    return <ErrorState title="Could not load this topic" onRetry={() => void topic.refetch()} />;
  }

  const current = topic.data;
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
          href={`/learn/${current.path.slug}`}
          className="transition-colors hover:text-foreground"
        >
          {current.path.title}
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="text-foreground">{current.title}</span>
      </nav>

      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {current.title}
        </h1>
        {current.summary ? (
          <p className="max-w-2xl text-muted-foreground">{current.summary}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {current.lessonCount} lesson{current.lessonCount === 1 ? '' : 's'}
          </span>
          <span aria-hidden>·</span>
          <span>{current.estimatedMinutes} min total</span>
          {current.completedPercent !== undefined ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {current.completedLessons ?? 0} completed · {current.completedPercent}%
              </span>
            </>
          ) : null}
        </div>
        {current.completedPercent !== undefined ? (
          <Progress value={current.completedPercent} className="max-w-60" />
        ) : null}
      </div>

      {current.lessons.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Lessons for this topic are being prepared.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {current.lessons.map((lesson) => (
            <LessonRow
              key={lesson.id}
              pathSlug={current.path.slug}
              topicSlug={current.slug}
              lesson={lesson}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
