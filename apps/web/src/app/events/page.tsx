'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Button,
  EmptyState,
  ErrorState,
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
import { EventCard } from '@/components/events/event-card';
import { ApiError } from '@/lib/api-client';
import { useAdminAccess } from '@/hooks/use-admin';
import { useEvents } from '@/hooks/use-events';

const PHASES = [
  { value: 'all', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'live', label: 'Live' },
  { value: 'past', label: 'Past' },
  { value: 'mine', label: 'My events' },
] as const;

export default function EventsPage(): React.JSX.Element {
  const [phase, setPhase] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState<string>('all');
  const [difficulty, setDifficulty] = useState<string>('all');
  const [debounced, setDebounced] = useState('');

  const query = useMemo(
    () => ({
      // "All" omits the phase entirely (public discovery set).
      ...(phase === 'all' ? {} : { phase: phase as 'upcoming' | 'live' | 'past' | 'mine' }),
      ...(debounced ? { q: debounced } : {}),
      ...(eventType !== 'all' ? { eventType: eventType as 'CONTEST' } : {}),
      ...(difficulty !== 'all' ? { difficulty: difficulty as 'EASY' } : {}),
      page: 1,
      pageSize: 20,
    }),
    [phase, debounced, eventType, difficulty],
  );
  const { data, isLoading, isError, error, refetch } = useEvents(query);
  // Anyone signed in can host an event; admins mint official ones.
  const createAccess = useAdminAccess(['manage:events']);

  const onSearch = (value: string): void => {
    setSearch(value);
    window.clearTimeout((onSearch as unknown as { t?: number }).t);
    (onSearch as unknown as { t?: number }).t = window.setTimeout(
      () => setDebounced(value.trim()),
      350,
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gather · Compete · Belong"
        title="Events"
        description="Discover aptitude events, register, and compete — powered by the canonical question library."
        actions={
          <Link href="/events/create">
            <Button className="btn-sheen shadow-lg shadow-primary/20">
              {createAccess.allowed ? 'Create event' : 'Host an event'}
            </Button>
          </Link>
        }
      />
      <Tabs value={phase} onValueChange={setPhase}>
        <TabsList className="glass sticky top-top-bar z-10 shadow-sm">
          {PHASES.map((p) => (
            <TabsTrigger key={p.value} value={p.value} className="gap-1.5">
              {p.value === 'live' ? <span className="live-dot" aria-hidden /> : null}
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="glass flex flex-col gap-3 rounded-2xl border border-border p-3 shadow-sm sm:flex-row sm:items-center">
        <SearchInput
          label="Search events"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search events…"
          className="sm:max-w-sm"
        />
        <div className="flex gap-2">
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="CONTEST">Contest</SelectItem>
              <SelectItem value="QUIZ">Quiz</SelectItem>
              <SelectItem value="WORKSHOP">Workshop</SelectItem>
              <SelectItem value="MARATHON">Marathon</SelectItem>
              <SelectItem value="MEETUP">Meetup</SelectItem>
              <SelectItem value="AMA">AMA</SelectItem>
              <SelectItem value="HACKATHON">Hackathon</SelectItem>
            </SelectContent>
          </Select>
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              <SelectItem value="EASY">Easy</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HARD">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading events">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="animate-fade-up overflow-hidden rounded-xl border border-border"
              style={{ animationDelay: `${i * 70}ms` }}
              aria-hidden
            >
              <div className="loading-rail h-1" aria-hidden>
                <span />
              </div>
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="skeleton-shine h-5 w-2/3 rounded-md" />
                  <div className="skeleton-shine h-5 w-16 rounded-full" />
                </div>
                <div className="skeleton-shine h-3 w-full rounded-md" />
                <div className="flex gap-2 pt-1">
                  <div className="skeleton-shine h-7 w-20 rounded-md" />
                  <div className="skeleton-shine h-7 w-20 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          description={error instanceof ApiError ? error.message : 'Could not load events.'}
          onRetry={() => {
            void refetch().catch((e: unknown) =>
              toast.error(e instanceof Error ? e.message : 'Retry failed'),
            );
          }}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No events found"
          description="Try a different filter — new events open regularly."
          action={
            createAccess.allowed ? (
              <Link href="/events/create">
                <Button>Create event</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((event, index) => (
            <div
              key={event.id}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
            >
              <EventCard event={event} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
