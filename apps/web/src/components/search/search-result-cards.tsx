'use client';

import Link from 'next/link';
import type {
  ContestSummaryDto,
  DiscussionThreadSummaryDto,
  EventSummaryDto,
  LearningSearchResultDto,
  TopicSearchResultDto,
} from '@apteez/types';
import { Badge, Card, CardContent, CardDescription, CardTitle } from '@apteez/ui';
import { useLogSearchEvent } from '@/hooks/use-search';

function useClickLogger(q: string) {
  const logEvent = useLogSearchEvent();
  return (resultType: string, resultId?: string) => ({
    onClick: (): void => {
      logEvent.mutate({ event: 'click', query: q, resultType, resultId });
    },
  });
}

export function TopicResultCard({
  item,
  q,
}: {
  item: TopicSearchResultDto;
  q: string;
}): React.JSX.Element {
  const handlers = useClickLogger(q);
  return (
    <Link href={`/explore?topic=${encodeURIComponent(item.slug)}`} {...handlers('TOPIC')}>
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <CardTitle className="truncate text-card-title">{item.name}</CardTitle>
            <CardDescription className="truncate">
              {item.domainName} · <span className="font-metric">{item.problemCount}</span> problems
            </CardDescription>
          </span>
          <Badge variant="outline">Topic</Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

function learningHref(item: LearningSearchResultDto): string {
  if (item.contentKind === 'path') {
    return `/learn/${item.pathSlug}`;
  }
  if (item.contentKind === 'topic') {
    return `/learn/${item.pathSlug}/${item.slug}`;
  }
  if (item.topicSlug) {
    return `/learn/${item.pathSlug}/${item.topicSlug}/${item.slug}`;
  }
  return `/learn/${item.pathSlug}`;
}

export function LearningResultCard({
  item,
  q,
}: {
  item: LearningSearchResultDto;
  q: string;
}): React.JSX.Element {
  const handlers = useClickLogger(q);
  return (
    <Link href={learningHref(item)} {...handlers('LEARNING')}>
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <CardTitle className="truncate text-card-title">{item.title}</CardTitle>
            <CardDescription className="truncate">{item.pathTitle}</CardDescription>
          </span>
          <Badge variant="outline">{item.contentKind}</Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

export function ContestResultCard({
  item,
  q,
}: {
  item: ContestSummaryDto;
  q: string;
}): React.JSX.Element {
  const handlers = useClickLogger(q);
  return (
    <Link href={`/contests/${item.id}`} {...handlers('CONTEST', item.id)}>
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <CardTitle className="truncate text-card-title">{item.name}</CardTitle>
            <CardDescription className="truncate">
              {item.phase} · <span className="font-metric">{item.participantCount}</span>{' '}
              participants
              {item.isRegistered ? ' · registered' : ''}
            </CardDescription>
          </span>
          <Badge
            variant={
              item.phase === 'live' ? 'success' : item.phase === 'past' ? 'secondary' : 'warning'
            }
            className="max-w-[110px] shrink-0 truncate"
          >
            {item.status}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

export function EventResultCard({
  item,
  q,
}: {
  item: EventSummaryDto;
  q: string;
}): React.JSX.Element {
  const handlers = useClickLogger(q);
  return (
    <Link href={`/events/${item.slug}`} {...handlers('EVENT', item.id)}>
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <CardTitle className="truncate text-card-title">{item.title}</CardTitle>
            <CardDescription className="truncate">
              {item.eventType} · {item.visibility.toLowerCase()} ·{' '}
              {new Date(item.startsAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </CardDescription>
          </span>
          <Badge
            variant={
              item.phase === 'live' ? 'success' : item.phase === 'past' ? 'secondary' : 'warning'
            }
            className="max-w-[110px] shrink-0 truncate"
          >
            {item.status.replace(/_/g, ' ')}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

export function DiscussionResultCard({
  item,
  q,
}: {
  item: DiscussionThreadSummaryDto;
  q: string;
}): React.JSX.Element {
  const handlers = useClickLogger(q);
  return (
    <Link href={`/discussions/${item.id}`} {...handlers('DISCUSSION', item.id)}>
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <CardTitle className="truncate text-card-title">{item.title}</CardTitle>
            <CardDescription className="truncate">
              {item.author.displayName} · <span className="font-metric">{item.replyCount}</span>{' '}
              replies · <span className="font-metric">{item.reactionCount}</span> reactions
            </CardDescription>
          </span>
          <Badge variant="outline">Discussion</Badge>
        </CardContent>
      </Card>
    </Link>
  );
}
