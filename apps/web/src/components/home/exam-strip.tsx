'use client';

import Link from 'next/link';
import { Badge, Skeleton } from '@apteez/ui';
import { useExamTags } from '@/hooks/use-problems';

/** Exam-context entry points, driven by the database taxonomy. */
export function ExamStrip(): React.JSX.Element {
  const { data, isPending } = useExamTags();

  if (isPending) {
    return (
      <div className="flex flex-wrap gap-2" aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-24 rounded-full" />
        ))}
      </div>
    );
  }

  const tags = data ?? [];
  if (tags.length === 0) {
    return <p className="text-sm text-muted-foreground">Exam tags arrive with the library.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Link key={tag.id} href={`/explore?exam=${tag.slug}`}>
          <Badge
            variant="outline"
            className="cursor-pointer px-3 py-1.5 text-sm transition-colors hover:border-primary/60 hover:text-foreground"
          >
            {tag.name}
            <span className="font-metric ml-1.5 text-muted-foreground">{tag.problemCount}</span>
          </Badge>
        </Link>
      ))}
    </div>
  );
}
