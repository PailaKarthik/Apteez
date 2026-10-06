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
    return <p className="p-6 text-sm text-muted-foreground">Loading thread...</p>;
  }
  if (isError || !thread) {
    return (
      <p className="p-6 text-sm text-destructive">
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
      <Link href="/discussions" className="inline-flex items-center gap-1 text-sm hover:underline">
        <ArrowLeft className="h-4 w-4 shrink-0" /> All discussions
      </Link>

      <article className="min-w-0 space-y-3">
        <h1 className="flex min-w-0 items-start gap-2 break-words text-2xl font-semibold">
          {thread.isResolved ? (
            <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-500" />
          ) : null}
          {thread.isLocked ? <Lock className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" /> : null}
          <span className="min-w-0">{thread.title}</span>
        </h1>
        <p className="break-words text-sm text-muted-foreground">
          {thread.author.displayName} · {new Date(thread.createdAt).toLocaleString()} ·{' '}
          {thread.viewCount} views
        </p>
        <div className="break-words whitespace-pre-wrap text-sm">{thread.body}</div>
        <div className="flex flex-wrap items-center gap-2">
          {thread.tags.map((tag) => (
            <span key={tag} className="max-w-full break-all rounded bg-muted px-2 py-0.5 text-xs">
              #{tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => postReaction('UPVOTE')}
            className={`inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-sm ${
              thread.myReaction === 'UPVOTE' ? 'bg-primary text-primary-foreground' : ''
            }`}
          >
            <ThumbsUp className="h-4 w-4" /> {thread.reactionCount}
          </button>
          <button
            type="button"
            onClick={() => postReaction('DOWNVOTE')}
            className={`inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-sm ${
              thread.myReaction === 'DOWNVOTE' ? 'bg-primary text-primary-foreground' : ''
            }`}
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>
      </article>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">{thread.replyTotal} replies</h2>
        <ul className="space-y-3">
          {thread.replies.map((reply) => (
            <li key={reply.id} className="min-w-0 rounded-lg border border-input p-4">
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
                  <span className="inline-flex items-center gap-1 text-emerald-600">
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
          <p className="text-sm text-muted-foreground">This thread is locked.</p>
        ) : (
          <div className="space-y-2">
            <textarea
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              rows={4}
              placeholder="Write a reply..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={submitReply}
                disabled={createReply.isPending || replyBody.trim().length < 2}
                className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                {createReply.isPending ? 'Posting...' : 'Reply'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
