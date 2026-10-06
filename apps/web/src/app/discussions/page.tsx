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
        title="Discussions"
        description="Strategies, solutions and doubt-solving with peers."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search threads..."
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {DISCUSSION_SORT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={`rounded-md px-3 py-2 text-sm ${
                sort === key ? 'bg-primary text-primary-foreground' : 'border border-input'
              }`}
            >
              {SORT_LABELS[key]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setComposing((value) => !value)}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> New thread
        </button>
      </div>

      {composing ? (
        <div className="space-y-3 rounded-lg border border-input p-4">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Thread title"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Share your question or strategy..."
            rows={5}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="quant, time-and-work (comma separated)"
            aria-label="Tags, comma separated"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {tags.trim() ? (
            <p className="text-xs text-muted-foreground">
              Tags: {parsedTags.length > 0 ? parsedTags.map((tag) => `#${tag}`).join(' ') : '—'}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setComposing(false)}
              className="rounded-md border border-input px-3 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={
                createThread.isPending || title.trim().length < 8 || body.trim().length < 10
              }
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {createThread.isPending ? 'Posting...' : 'Post thread'}
            </button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading discussions...</p>
      ) : isError ? (
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'Could not load discussions.'}
        </p>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-input p-10 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No threads yet. Start the first discussion.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((thread) => (
            <li key={thread.id} className="rounded-lg border border-input p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/discussions/${thread.id}`}
                    className="flex items-center gap-2 font-medium hover:underline"
                  >
                    {thread.isPinned ? <Pin className="h-4 w-4 text-primary" /> : null}
                    {thread.isResolved ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : null}
                    {thread.isLocked ? <Lock className="h-4 w-4 text-muted-foreground" /> : null}
                    <span className="truncate">{thread.title}</span>
                  </Link>
                  <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
                    {thread.excerpt}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">{thread.author.displayName}</span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {thread.replyCount}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <ThumbsUp className="h-3 w-3" /> {thread.reactionCount}
                    </span>
                    {thread.tags.map((tag) => (
                      <span key={tag} className="max-w-full break-all rounded bg-muted px-2 py-0.5">
                        #{tag}
                      </span>
                    ))}
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
