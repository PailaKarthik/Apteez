'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@apteez/ui';
import { PageHeader } from '@/components/shared/page-header';
import { ProblemCard } from '@/components/problems/problem-card';
import {
  ContestResultCard,
  DiscussionResultCard,
  EventResultCard,
  LearningResultCard,
  TopicResultCard,
} from '@/components/search/search-result-cards';
import {
  useClearRecentSearches,
  useGroupedSearch,
  useLogSearchEvent,
  useProblemFilters,
  useRecentSearches,
  useSearchResults,
  useTrending,
  type SearchTab,
} from '@/hooks/use-search';
import { useExamTags } from '@/hooks/use-problems';
import { ApiError } from '@/lib/api-client';
import type {
  ContestSummaryDto,
  DiscussionThreadSummaryDto,
  EventSummaryDto,
  LearningSearchResultDto,
  ProblemSummaryDto,
  TopicSearchResultDto,
} from '@apteez/types';

const TABS: Array<{ value: SearchTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'PROBLEM', label: 'Problems' },
  { value: 'TOPIC', label: 'Topics' },
  { value: 'LEARNING', label: 'Learning' },
  { value: 'CONTEST', label: 'Contests' },
  { value: 'EVENT', label: 'Events' },
  { value: 'DISCUSSION', label: 'Discussions' },
];

function SearchPageInner(): React.JSX.Element {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [submitted, setSubmitted] = useState(initialQ);
  const [tab, setTab] = useState<SearchTab>('all');
  const [difficulty, setDifficulty] = useState<string>('any');
  const [exam, setExam] = useState<string>('any');
  const [sort, setSort] = useState<'relevance' | 'newest' | 'rating'>('relevance');
  const logEvent = useLogSearchEvent();
  const { data: examTags } = useExamTags();
  const { data: filters } = useProblemFilters(tab === 'PROBLEM' || tab === 'all');

  useEffect(() => {
    setQ(initialQ);
    setSubmitted(initialQ);
  }, [initialQ]);

  const trimmed = submitted.trim();
  const results = useSearchResults(
    {
      q: trimmed,
      type: tab,
      difficulty: difficulty === 'any' ? undefined : difficulty,
      exam: exam === 'any' ? undefined : exam,
      sort,
      limit: 20,
    },
    trimmed.length > 0 && tab !== 'all',
  );
  const grouped = useGroupedSearch(trimmed, trimmed.length > 0 && tab === 'all');
  const trending = useTrending(trimmed.length === 0);
  const recent = useRecentSearches(trimmed.length === 0);
  const clearRecent = useClearRecentSearches();

  const submit = (value: string): void => {
    const next = value.trim();
    setSubmitted(next);
    if (next.length > 0) {
      logEvent.mutate({ event: 'search', query: next });
    }
  };

  const flatItems = useMemo(
    () => results.data?.pages.flatMap((page) => page.items) ?? [],
    [results.data],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search"
        description="Problems, topics, learning, contests, events and discussions."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(q);
        }}
      >
        <SearchInput
          label="Search ApteeZ"
          placeholder="Try time and work, quadratic, statement..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
      </form>

      <Tabs value={tab} onValueChange={(value) => setTab(value as SearchTab)}>
        {/* Scrollable tab row: seven tabs never fit a 360px viewport. */}
        <TabsList className="max-w-full justify-start overflow-x-auto">
          {TABS.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value} className="shrink-0 whitespace-nowrap">
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'PROBLEM' ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger className="w-full sm:w-36" aria-label="Difficulty filter">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any difficulty</SelectItem>
              <SelectItem value="EASY">Easy</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HARD">Hard</SelectItem>
            </SelectContent>
          </Select>
          <Select value={exam} onValueChange={setExam}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Exam filter">
              <SelectValue placeholder="Exam" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any exam</SelectItem>
              {(examTags ?? filters?.exams ?? []).map((tag) => (
                <SelectItem key={tag.slug} value={tag.slug}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Sort order">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="rating">Rating</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {trimmed.length === 0 ? (
        <div className="space-y-6">
          {recent.data && recent.data.items.length > 0 ? (
            <section aria-label="Recent searches" className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-section-title">Recent searches</h2>
                <Button variant="ghost" size="sm" onClick={() => clearRecent.mutate()}>
                  Clear
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.data.items.map((row) => (
                  <Button
                    key={`${row.query}-${row.searchedAt}`}
                    variant="outline"
                    size="sm"
                    onClick={() => submit(row.query)}
                  >
                    {row.query}
                  </Button>
                ))}
              </div>
            </section>
          ) : null}
          {trending.data ? (
            <section aria-label="Trending" className="space-y-4">
              <h2 className="text-section-title">Trending this week</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {trending.data.problems.slice(0, 4).map((problem) => (
                  <ProblemCard key={problem.id} problem={problem} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : tab === 'all' ? (
        <GroupedResults
          q={trimmed}
          loading={grouped.isLoading}
          error={grouped.error instanceof ApiError ? grouped.error.message : null}
          data={grouped.data}
          onOpenTab={setTab}
        />
      ) : (
        <PagedResults
          q={trimmed}
          tab={tab}
          items={flatItems}
          isLoading={results.isLoading}
          error={results.error instanceof ApiError ? results.error.message : null}
          hasMore={results.hasNextPage}
          onMore={() => void results.fetchNextPage()}
          loadingMore={results.isFetchingNextPage}
        />
      )}
    </div>
  );
}

function GroupedResults({
  q,
  loading,
  error,
  data,
  onOpenTab,
}: {
  q: string;
  loading: boolean;
  error: string | null;
  data: ReturnType<typeof useGroupedSearch>['data'];
  onOpenTab: (tab: SearchTab) => void;
}): React.JSX.Element {
  if (loading) {
    return <LoadingState title="Searching..." />;
  }
  if (error || !data) {
    return <ErrorState description={error ?? 'Search failed. Try again.'} />;
  }
  if (error || !data) {
    return <ErrorState description="Search failed. Try again." />;
  }
  const sections: Array<{ tab: SearchTab; title: string; count: number; body: React.ReactNode }> = [
    {
      tab: 'PROBLEM',
      title: 'Problems',
      count: data.problems.length,
      body: (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.problems.slice(0, 4).map((problem) => (
            <ProblemCard key={problem.id} problem={problem as ProblemSummaryDto} />
          ))}
        </div>
      ),
    },
    {
      tab: 'TOPIC',
      title: 'Topics',
      count: data.topics.length,
      body: (
        <div className="grid gap-3 sm:grid-cols-2">
          {(data.topics as TopicSearchResultDto[]).slice(0, 4).map((topic) => (
            <TopicResultCard key={topic.id} item={topic} q={q} />
          ))}
        </div>
      ),
    },
    {
      tab: 'LEARNING',
      title: 'Learning',
      count: data.learning.length,
      body: (
        <div className="grid gap-3 sm:grid-cols-2">
          {(data.learning as LearningSearchResultDto[]).slice(0, 4).map((row) => (
            <LearningResultCard key={row.id} item={row} q={q} />
          ))}
        </div>
      ),
    },
    {
      tab: 'CONTEST',
      title: 'Contests',
      count: data.contests.length,
      body: (
        <div className="grid gap-3 sm:grid-cols-2">
          {(data.contests as ContestSummaryDto[]).slice(0, 4).map((row) => (
            <ContestResultCard key={row.id} item={row} q={q} />
          ))}
        </div>
      ),
    },
    {
      tab: 'EVENT',
      title: 'Events',
      count: data.events.length,
      body: (
        <div className="grid gap-3 sm:grid-cols-2">
          {(data.events as EventSummaryDto[]).slice(0, 4).map((row) => (
            <EventResultCard key={row.id} item={row} q={q} />
          ))}
        </div>
      ),
    },
    {
      tab: 'DISCUSSION',
      title: 'Discussions',
      count: data.discussions.length,
      body: (
        <div className="grid gap-3 sm:grid-cols-2">
          {(data.discussions as DiscussionThreadSummaryDto[]).slice(0, 4).map((row) => (
            <DiscussionResultCard key={row.id} item={row} q={q} />
          ))}
        </div>
      ),
    },
  ];
  const total = sections.reduce((sum, section) => sum + section.count, 0);
  if (total === 0) {
    return (
      <EmptyState
        title="No results"
        description={`Nothing matched “${q}” yet. Try fewer words or browse Explore.`}
      />
    );
  }
  return (
    <div className="space-y-6">
      {sections
        .filter((section) => section.count > 0)
        .map((section) => (
          <section key={section.tab} aria-label={section.title} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-section-title">{section.title}</h2>
              <Button variant="ghost" size="sm" onClick={() => onOpenTab(section.tab)}>
                View all
              </Button>
            </div>
            {section.body}
          </section>
        ))}
    </div>
  );
}

function PagedResults({
  q,
  tab,
  items,
  isLoading,
  error,
  hasMore,
  onMore,
  loadingMore,
}: {
  q: string;
  tab: SearchTab;
  items: Array<{ id: string } & Record<string, unknown>>;
  isLoading: boolean;
  error: string | null;
  hasMore: boolean | undefined;
  onMore: () => void;
  loadingMore: boolean;
}): React.JSX.Element {
  if (isLoading) {
    return <LoadingState title="Searching..." />;
  }
  if (error) {
    return <ErrorState description={error} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No results"
        description={`Nothing matched “${q}” in ${tab.toLowerCase()}.`}
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          if (tab === 'PROBLEM') {
            return <ProblemCard key={item.id} problem={item as unknown as ProblemSummaryDto} />;
          }
          if (tab === 'TOPIC') {
            return (
              <TopicResultCard key={item.id} item={item as unknown as TopicSearchResultDto} q={q} />
            );
          }
          if (tab === 'LEARNING') {
            return (
              <LearningResultCard
                key={item.id}
                item={item as unknown as LearningSearchResultDto}
                q={q}
              />
            );
          }
          if (tab === 'CONTEST') {
            return (
              <ContestResultCard key={item.id} item={item as unknown as ContestSummaryDto} q={q} />
            );
          }
          if (tab === 'EVENT') {
            return (
              <EventResultCard key={item.id} item={item as unknown as EventSummaryDto} q={q} />
            );
          }
          return (
            <DiscussionResultCard
              key={item.id}
              item={item as unknown as DiscussionThreadSummaryDto}
              q={q}
            />
          );
        })}
      </div>
      {hasMore ? (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={onMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default function SearchPage(): React.JSX.Element {
  return (
    <Suspense fallback={<LoadingState title="Loading search…" />}>
      <SearchPageInner />
    </Suspense>
  );
}
