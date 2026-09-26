'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
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
  const [origin, setOrigin] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState<string>('all');
  const [difficulty, setDifficulty] = useState<string>('all');
  const [debounced, setDebounced] = useState('');

  const query = useMemo(
    () => ({
      // "All" omits the phase entirely (public discovery set).
      ...(phase === 'all' ? {} : { phase: phase as 'upcoming' | 'live' | 'past' | 'mine' }),
      ...(origin !== 'all' ? { origin: origin as 'official' | 'community' } : {}),
      ...(debounced ? { q: debounced } : {}),
      ...(eventType !== 'all' ? { eventType: eventType as 'CONTEST' } : {}),
      ...(difficulty !== 'all' ? { difficulty: difficulty as 'EASY' } : {}),
      page: 1,
      pageSize: 20,
    }),
    [phase, origin, debounced, eventType, difficulty],
  );
  const { data, isLoading, isError, error, refetch } = useEvents(query);
  // Anyone signed in can create a community event; admins mint official ones.
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
        title="Events"
        description="Discover aptitude events, register, and compete — powered by the canonical question library."
        actions={
          <Link href="/events/create">
            <Button>{createAccess.allowed ? 'Create event' : 'Host community event'}</Button>
          </Link>
        }
      />
      <Tabs value={phase} onValueChange={setPhase}>
        <TabsList>
          {PHASES.map((p) => (
            <TabsTrigger key={p.value} value={p.value}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          label="Search events"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search events…"
          className="sm:max-w-sm"
        />
        <div className="flex gap-2">
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger className="w-36" aria-label="Origin filter">
              <SelectValue placeholder="Origin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="official">Official</SelectItem>
              <SelectItem value="community">Community</SelectItem>
            </SelectContent>
          </Select>
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
        <LoadingState title="Loading events…" />
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
          {data.items.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
