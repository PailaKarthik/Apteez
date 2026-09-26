'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchInput } from '@apteez/ui';
import { useLogSearchEvent, useSearchSuggestions } from '@/hooks/use-search';

interface SuggestionEntry {
  key: string;
  label: string;
  hint: string;
  href: string;
  type: string;
  id: string;
}

/** Top-bar autocomplete: debounced, grouped, keyboard-navigable, screen-reader labeled. */
export function GlobalSearch(): React.JSX.Element {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const logEvent = useLogSearchEvent();
  const { data } = useSearchSuggestions(debounced, open && debounced.trim().length >= 2);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), 250);
    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    setActive(0);
  }, [debounced]);

  useEffect(() => {
    const onPointer = (event: PointerEvent): void => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, []);

  const entries: SuggestionEntry[] = useMemo(() => {
    if (!data) {
      return [];
    }
    return [
      ...data.problems.map((row) => ({
        key: `problem-${row.id}`,
        label: row.title,
        hint: 'Problem',
        href: `/problems/${row.id}`,
        type: 'PROBLEM',
        id: row.id,
      })),
      ...data.topics.map((row) => ({
        key: `topic-${row.slug}`,
        label: row.name,
        hint: 'Topic',
        href: `/explore?topic=${encodeURIComponent(row.slug)}`,
        type: 'TOPIC',
        id: row.slug,
      })),
      ...data.contests.map((row) => ({
        key: `contest-${row.id}`,
        label: row.title,
        hint: 'Contest',
        href: `/contests/${row.id}`,
        type: 'CONTEST',
        id: row.id,
      })),
      ...data.events.map((row) => ({
        key: `event-${row.id}`,
        label: row.title,
        hint: 'Event',
        href: `/events/${row.id}`,
        type: 'EVENT',
        id: row.id,
      })),
      ...data.discussions.map((row) => ({
        key: `discussion-${row.id}`,
        label: row.title,
        hint: 'Discussion',
        href: `/discussions/${row.id}`,
        type: 'DISCUSSION',
        id: row.id,
      })),
    ];
  }, [data]);

  const showMenu = open && debounced.trim().length >= 2;

  const submitAll = (): void => {
    const q = value.trim();
    if (q.length === 0) {
      return;
    }
    setOpen(false);
    logEvent.mutate({ event: 'search', query: q });
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const choose = (entry: SuggestionEntry): void => {
    setOpen(false);
    logEvent.mutate({
      event: 'click',
      query: debounced.trim(),
      resultType: entry.type,
      resultId: entry.type === 'TOPIC' ? undefined : entry.id,
    });
    router.push(entry.href);
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <SearchInput
        label="Search problems, topics, contests, events and discussions"
        placeholder="Search ApteeZ…"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
          } else if (event.key === 'ArrowDown' && showMenu && entries.length > 0) {
            event.preventDefault();
            setActive((index) => (index + 1) % entries.length);
          } else if (event.key === 'ArrowUp' && showMenu && entries.length > 0) {
            event.preventDefault();
            setActive((index) => (index - 1 + entries.length) % entries.length);
          } else if (event.key === 'Enter') {
            if (showMenu && entries[active]) {
              event.preventDefault();
              choose(entries[active]);
            } else {
              submitAll();
            }
          }
        }}
        role="combobox"
        aria-expanded={showMenu && entries.length > 0}
        aria-controls={listId}
        aria-activedescendant={
          showMenu && entries[active] ? `${listId}-${entries[active].key}` : undefined
        }
      />
      {showMenu && entries.length > 0 ? (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-elevated shadow-lg">
          <ul
            role="listbox"
            id={listId}
            aria-label="Search suggestions"
            className="max-h-80 overflow-y-auto py-1"
          >
            {entries.map((entry, index) => (
              <li
                key={entry.key}
                id={`${listId}-${entry.key}`}
                role="option"
                aria-selected={index === active}
              >
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(entry)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    index === active ? 'bg-accent text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.label}</span>
                  <span className="shrink-0 text-xs">{entry.hint}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={submitAll}
            className="w-full border-t border-border px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            See all results for “{debounced.trim()}”
          </button>
        </div>
      ) : null}
    </div>
  );
}
