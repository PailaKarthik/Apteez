'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2 } from 'lucide-react';
import type { LearningPathDetailDto } from '@apteez/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  LoadingState,
  Progress,
} from '@apteez/ui';
import { useLearningPath, useLearningProgress } from '@/hooks/use-learning';

function formatMinutes(minutes: number): string {
  if (minutes < 1) {
    return 'Coming soon';
  }
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

function PathTopics({ path }: { path: LearningPathDetailDto }): React.JSX.Element {
  if (path.topicCount === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Topics for this path are being prepared. Check back soon.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {path.topics.map((topic) => (
        <Card key={topic.id} className="transition-colors duration-fast hover:border-primary/50">
          <CardHeader className="p-5">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-card-title">{topic.title}</CardTitle>
              <Badge variant="secondary">
                {topic.lessonCount} lesson{topic.lessonCount === 1 ? '' : 's'}
              </Badge>
            </div>
            {topic.summary ? <CardDescription>{topic.summary}</CardDescription> : null}
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0">
            {topic.completedPercent !== undefined ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {topic.completedLessons ?? 0} of {topic.lessonCount} complete
                  </span>
                  <span className="font-metric">{topic.completedPercent}%</span>
                </div>
                <Progress value={topic.completedPercent} />
              </div>
            ) : null}
            <Button asChild variant="outline" className="w-full">
              <Link href={`/learn/${path.slug}/${topic.slug}`}>
                Study topic
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** One learning domain: topic grid plus a resume CTA when available. */
export function LearningPathView({ slug }: { slug: string }): React.JSX.Element {
  const path = useLearningPath(slug);
  const progress = useLearningProgress();
  const resume = progress.data?.resume;
  const resumeInPath = resume && resume.pathSlug === slug ? resume : null;

  if (path.isPending) {
    return <LoadingState title="Loading path…" />;
  }
  if (path.isError || !path.data) {
    return <ErrorState title="Could not load this path" onRetry={() => void path.refetch()} />;
  }

  const current = path.data;
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/explore" className="transition-colors hover:text-foreground">
            Explore
          </Link>
          <span aria-hidden className="mx-2">
            /
          </span>
          <span className="text-foreground">{current.title}</span>
        </nav>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {current.title}
            </h1>
            {current.description ? (
              <p className="max-w-2xl text-muted-foreground">{current.description}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                {current.topicCount} topic{current.topicCount === 1 ? '' : 's'}
              </span>
              <span aria-hidden>·</span>
              <span>
                {current.lessonCount} lesson{current.lessonCount === 1 ? '' : 's'}
              </span>
              <span aria-hidden>·</span>
              <span>{formatMinutes(current.estimatedMinutes)}</span>
            </div>
          </div>
          {current.progress ? (
            <div className="w-full max-w-60 space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {current.progress.completedLessons} / {current.lessonCount} completed
                </span>
                <span className="font-metric">{current.progress.completedPercent}%</span>
              </div>
              <Progress value={current.progress.completedPercent} />
            </div>
          ) : null}
        </div>
        {resumeInPath ? (
          <Button asChild>
            <Link
              href={`/learn/${resumeInPath.pathSlug}/${resumeInPath.topicSlug}/${resumeInPath.lessonSlug}`}
            >
              <BookOpen aria-hidden />
              Continue: {resumeInPath.lessonTitle}
            </Link>
          </Button>
        ) : null}
      </div>

      <section aria-label={`${current.title} topics`} className="space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <CheckCircle2 className="size-5 text-primary" aria-hidden />
          Topics
        </h2>
        <PathTopics path={current} />
      </section>
    </div>
  );
}
