'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Lock, ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import {
  useAcceptReply,
  useCreateReply,
  useDiscussion,
  useReactToPost,
  useReactToReply,
} from '@/hooks/use-discussions';
import { useAuth } from '@/hooks/use-auth';

export default function DiscussionThreadPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user } = useAuth();
  const { data: thread, isLoading, isError, error } = useDiscussion(id);
  const createReply = useCreateReply(id ?? '');
  const acceptReply = useAcceptReply(id ?? '');
  const reactToPost = useReactToPost();
  const reactToReply = useReactToReply();
  const [replyBody, setReplyBody] = useState('');

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in space-y-4 p-4 sm:p-6" aria-busy="true" aria-label="Loading thread">
        <div className="loading-rail h-1" aria-hidden>
          <span />
        </div>
        <div className="skeleton-shine h-8 w-3/4 rounded-lg" />
        <div className="skeleton-shine h-4 w-1/3 rounded-md" />
        <div className="skeleton-shine h-24 w-full rounded-xl" />
        <div className="skeleton-shine h-20 w-full rounded-xl" />
        <div className="skeleton-shine h-20 w-full rounded-xl" />
      </div>
    );
  }
  if (isError || !thread) {
    return (
      <p className="mx-auto max-w-3xl animate-fade-in rounded-xl bg-destructive/10 p-6 text-sm text-destructive">
        {error instanceof ApiError ? error.message : 'Thread not found.'}
      </p>
    );
  }

  const postReaction = (type: 'UPVOTE' | 'DOWNVOTE'): void => {
    if (!user) {
      toast.error('Sign in to react.');
      return;
    }
    reactToPost.mutate({ postId: thread.id, type: thread.myReaction === type ? null : type });
  };

  const submitReply = (): void => {
    if (!user) {
      toast.error('Sign in to reply.');
      return;
    }
    createReply.mutate(
      { body: replyBody.trim() },
      {
        onSuccess: () => {
          setReplyBody('');
          toast.success('Reply posted.');
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Could not post the reply.'),
      },
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <Link
        href="/discussions"
        className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5" /> All discussions
      </Link>

      <article className="page-enter min-w-0 space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h1 className="flex min-w-0 items-start gap-2 break-words text-2xl font-bold tracking-tight">
          {thread.isResolved ? (
            <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-success/10" aria-hidden>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </span>
          ) : null}
          {thread.isLocked ? <Lock className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" /> : null}
          <span className="min-w-0">{thread.title}</span>
        </h1>
        <p className="break-words text-sm text-muted-foreground">
          <span className="font-medium text-foreground/80">{thread.author.displayName}</span> · {new Date(thread.createdAt).toLocaleString()} ·{' '}
          {thread.viewCount} views
        </p>
        <span className="block h-px bg-gradient-to-r from-primary/30 to-transparent" aria-hidden />
        <div className="break-words whitespace-pre-wrap text-sm leading-relaxed">{thread.body}</div>
        <div className="flex flex-wrap items-center gap-2">
          {thread.tags.map((tag) => (
            <span key={tag} className="max-w-full break-all rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-xs text-primary">
              #{tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => postReaction('UPVOTE')}
            className={`inline-flex items-center gap-1.5 rounded-xl border border-input px-3 py-1.5 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md hover:shadow-primary/15 ${
              thread.myReaction === 'UPVOTE' ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25' : ''
            }`}
          >
            <ThumbsUp className="h-4 w-4" /> {thread.reactionCount}
          </button>
          <button
            type="button"
            onClick={() => postReaction('DOWNVOTE')}
            className={`inline-flex items-center gap-1.5 rounded-xl border border-input px-3 py-1.5 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 ${
              thread.myReaction === 'DOWNVOTE' ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25' : ''
            }`}
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>
      </article>

      <section className="page-enter-1 space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="shrink-0 text-lg font-bold">{thread.replyTotal} replies</h2>
          <span className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" aria-hidden />
        </div>
        <ul className="space-y-3">
          {thread.replies.map((reply, index) => (
            <li
              key={reply.id}
              className={`row-enter min-w-0 rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 ${reply.isAcceptedSolution ? 'border-success/40 bg-success/[0.04]' : 'border-input bg-card'}`}
              style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {reply.author.displayName}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(reply.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 break-words whitespace-pre-wrap text-sm">{reply.body}</p>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      toast.error('Sign in to react.');
                      return;
                    }
                    reactToReply.mutate({
                      postId: thread.id,
                      replyId: reply.id,
                      type: reply.myReaction === 'UPVOTE' ? 'DOWNVOTE' : 'UPVOTE',
                    });
                  }}
                  className="inline-flex items-center gap-1"
                >
                  <ThumbsUp className="h-3 w-3" /> {reply.reactionCount}
                </button>
                {reply.isAcceptedSolution ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <CheckCircle2 className="h-3 w-3" /> Accepted solution
                  </span>
                ) : reply.canAccept ? (
                  <button
                    type="button"
                    onClick={() =>
                      acceptReply.mutate(reply.id, {
                        onSuccess: () => toast.success('Marked as accepted solution.'),
                      })
                    }
                    className="text-primary hover:underline"
                  >
                    Accept as solution
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {thread.isLocked ? (
          <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">This thread is locked.</p>
        ) : (
          <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <textarea
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              rows={4}
              placeholder="Write a reply..."
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm transition-all placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={submitReply}
                disabled={createReply.isPending || replyBody.trim().length < 2}
                className="btn-sheen rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {createReply.isPending ? <span className="typing-dots">Posting</span> : 'Reply'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
