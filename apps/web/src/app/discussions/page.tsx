'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Lock, MessageSquare, Pin, Plus, Search, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import type { DiscussionSortKey } from '@apteez/types';
import { DISCUSSION_SORT_KEYS } from '@apteez/types';
import { ApiError } from '@/lib/api-client';
import { useCreateThread, useDiscussions } from '@/hooks/use-discussions';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/shared/page-header';

const SORT_LABELS: Record<DiscussionSortKey, string> = {
  latest: 'Latest',
  top: 'Top',
  unanswered: 'Unanswered',
};

export default function DiscussionsPage(): React.JSX.Element {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<DiscussionSortKey>('latest');
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');

  const query = useMemo(
    () => ({ q: search.trim() || undefined, sort, page: 1, pageSize: 20 }),
    [search, sort],
  );
  const { data, isLoading, isError, error } = useDiscussions(query);
  const createThread = useCreateThread();

  // Mirror the server tag rules client-side (lowercase, spaces to hyphens,
  // only a-z/0-9/-, deduped, max 5) so normal typing can never 400.
  const parsedTags = useMemo(
    () =>
      [
        ...new Set(
          tags
            .split(',')
            .map((tag) =>
              tag
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, ''),
            )
            .filter(Boolean),
        ),
      ].slice(0, 5),
    [tags],
  );

  const submit = (): void => {
    if (!user) {
      toast.error('Sign in to start a discussion.');
      return;
    }
    createThread.mutate(
      {
        title: title.trim(),
        body: body.trim(),
        tags: parsedTags,
      },
      {
        onSuccess: () => {
          toast.success('Discussion posted.');
          setTitle('');
          setBody('');
          setTags('');
          setComposing(false);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.kind === 'validation' && err.details?.length) {
            toast.error(err.details.map((detail) => detail.message).join(' '));
            return;
          }
          if (err instanceof ApiError && err.status === 403) {
            toast.error('Post refused: open the app at http://localhost:3000 and try again.');
            return;
          }
          toast.error(err instanceof ApiError ? err.message : 'Could not post the discussion.');
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Community · Doubts · Strategy"
        title="Discussions"
        description="Strategies, solutions and doubt-solving with peers."
      />

      <div className="glass page-enter-1 flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search threads..."
            className="w-full rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div className="flex gap-1 rounded-xl bg-muted/60 p-1" role="group" aria-label="Sort threads">
          {DISCUSSION_SORT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              aria-pressed={sort === key}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                sort === key
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {SORT_LABELS[key]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setComposing((value) => !value)}
          className="btn-sheen inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-300 hover:-translate-y-0.5"
        >
          <Plus className="h-4 w-4" /> New thread
        </button>
      </div>

      {composing ? (
        <div className="animate-scale-in space-y-3 rounded-2xl border border-primary/25 bg-card p-4 shadow-lg shadow-primary/10 sm:p-5">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Thread title"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm transition-all placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Share your question or strategy..."
            rows={5}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm transition-all placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="quant, time-and-work (comma separated)"
            aria-label="Tags, comma separated"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm transition-all placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          {tags.trim() ? (
            <p className="text-xs text-muted-foreground">
              Tags:{' '}
              {parsedTags.length > 0 ? (
                <span className="font-medium text-primary">
                  {parsedTags.map((tag) => `#${tag}`).join(' ')}
                </span>
              ) : (
                '—'
              )}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setComposing(false)}
              className="rounded-xl border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={
                createThread.isPending || title.trim().length < 8 || body.trim().length < 10
              }
              className="btn-sheen rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {createThread.isPending ? <span className="typing-dots">Posting</span> : 'Post thread'}
            </button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading discussions">
          <div className="loading-rail h-1" aria-hidden>
            <span />
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="animate-fade-up rounded-2xl border border-border p-4"
              style={{ animationDelay: `${i * 60}ms` }}
              aria-hidden
            >
              <div className="skeleton-shine h-5 w-2/3 rounded-md" />
              <div className="skeleton-shine mt-2 h-3 w-full rounded-md" />
              <div className="mt-3 flex gap-2">
                <div className="skeleton-shine h-4 w-16 rounded-md" />
                <div className="skeleton-shine h-4 w-16 rounded-md" />
                <div className="skeleton-shine h-4 w-12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="animate-fade-in rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'Could not load discussions.'}
        </p>
      ) : !data || data.items.length === 0 ? (
        <div className="animate-scale-in rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] p-10 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10" aria-hidden>
            <MessageSquare className="h-7 w-7 text-primary" />
          </span>
          <p className="mt-3 text-sm font-semibold text-foreground">No threads yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start the first discussion — your question helps everyone.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((thread, index) => (
            <li
              key={thread.id}
              className="row-enter"
              style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
            >
              <div className="card-lift group rounded-2xl border border-border bg-card p-4 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/discussions/${thread.id}`}
                      className="flex items-center gap-2 font-medium transition-colors hover:text-primary"
                    >
                      {thread.isPinned ? (
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10" aria-hidden>
                          <Pin className="h-3.5 w-3.5 text-primary" />
                        </span>
                      ) : null}
                      {thread.isResolved ? (
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-success/10" aria-hidden>
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        </span>
                      ) : null}
                      {thread.isLocked ? <Lock className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
                      <span className="truncate">{thread.title}</span>
                    </Link>
                    <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
                      {thread.excerpt}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate font-medium text-foreground/80">{thread.author.displayName}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted/70 px-1.5 py-0.5">
                        <MessageSquare className="h-3 w-3" /> {thread.replyCount}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted/70 px-1.5 py-0.5">
                        <ThumbsUp className="h-3 w-3" /> {thread.reactionCount}
                      </span>
                      {thread.tags.map((tag) => (
                        <span key={tag} className="max-w-full break-all rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-primary">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
