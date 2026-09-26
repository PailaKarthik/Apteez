'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  ErrorState,
  Label,
  LoadingState,
  Textarea,
  cn,
} from '@apteez/ui';
import { ApiError } from '@/lib/api-client';
import { ContributionForm } from '@/components/contribute/contribution-form';
import { useCategoryTopics } from '@/hooks/use-problems';
import {
  useAdminAccess,
  useAdminContribution,
  useAnalyzeContribution,
  useApproveContribution,
  useEditContribution,
  usePickupContribution,
  useRejectContribution,
  useRequestChanges,
} from '@/hooks/use-admin';

function ActionDialog({
  title,
  description,
  needFeedback,
  needTopic,
  topics,
  topicsHint,
  requireTopic,
  pending,
  onConfirm,
}: {
  title: string;
  description: string;
  needFeedback: boolean;
  needTopic?: boolean;
  /** Real topic slugs to pick from — free typing is what caused slug rejections. */
  topics?: Array<{ slug: string; name: string }>;
  topicsHint?: string;
  /** True when the contribution has no mapped topic: a pick is mandatory. */
  requireTopic?: boolean;
  pending: boolean;
  onConfirm: (note: string, feedback: string, topicSlug?: string) => void;
}) {
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState('');
  const [topicSlug, setTopicSlug] = useState('');
  const [open, setOpen] = useState(false);
  const valid =
    (!needFeedback || feedback.trim().length >= 5) &&
    (!needTopic || !requireTopic || topicSlug !== '');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={title === 'Approve' ? 'default' : title === 'Reject' ? 'destructive' : 'outline'}
          disabled={pending}
        >
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title} contribution</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="space-y-1.5">
            <Label htmlFor={`review-note-${title}`}>Staff note (internal)</Label>
            <Textarea
              id={`review-note-${title}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
            />
          </div>
          {needFeedback ? (
            <div className="space-y-1.5">
              <Label htmlFor={`review-feedback-${title}`}>Contributor feedback (required)</Label>
              <Textarea
                id={`review-feedback-${title}`}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={3}
              />
            </div>
          ) : null}
          {needTopic ? (
            <div className="space-y-1.5">
              <Label htmlFor={`review-topic-${title}`}>
                Topic{requireTopic ? ' (required — none is mapped)' : ' (optional override)'}
              </Label>
              <select
                id={`review-topic-${title}`}
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={topicSlug}
                onChange={(event) => setTopicSlug(event.target.value)}
              >
                <option value="">{requireTopic ? 'Pick a topic…' : 'No override'}</option>
                {(topics ?? []).map((topic) => (
                  <option key={topic.slug} value={topic.slug}>
                    {topic.name}
                  </option>
                ))}
              </select>
              {topicsHint ? <p className="text-xs text-muted-foreground">{topicsHint}</p> : null}
            </div>
          ) : null}
          <Button
            className="w-full"
            disabled={pending || !valid}
            onClick={() => {
              onConfirm(note.trim(), feedback.trim(), topicSlug.trim() || undefined);
              setOpen(false);
            }}
          >
            {pending ? 'Working…' : `Confirm ${title.toLowerCase()}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminContributionReviewPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { allowed, isLoading: accessLoading } = useAdminAccess(['review:contributions']);
  const { data, isLoading, isError, refetch } = useAdminContribution(id, allowed);
  const approve = useApproveContribution(id ?? '');
  const reject = useRejectContribution(id ?? '');
  const requestChanges = useRequestChanges(id ?? '');
  const analyze = useAnalyzeContribution(id ?? '');
  const pickup = usePickupContribution(id ?? '');
  const edit = useEditContribution(id ?? '');
  const [modifying, setModifying] = useState(false);
  const [editNote, setEditNote] = useState('');
  // Topic options for the approve override, scoped to the contribution's
  // section. Hook sits before the early returns; it stays disabled until the
  // section slug is known.
  const sectionTopics = useCategoryTopics(data?.category?.slug ?? undefined);

  if (accessLoading || isLoading) {
    return <LoadingState title="Loading contribution…" />;
  }
  if (!allowed) {
    return (
      <EmptyState title="No access" description="Your staff account lacks review:contributions." />
    );
  }
  if (isError || !data) {
    return (
      <ErrorState description="Could not load this contribution." onRetry={() => void refetch()} />
    );
  }

  const decided = data.status === 'APPROVED' || data.status === 'REJECTED';
  const fail = (error: unknown, fallback: string): void => {
    toast.error(error instanceof ApiError ? error.message : fallback);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  decided ? (data.status === 'APPROVED' ? 'success' : 'destructive') : 'warning'
                }
              >
                {data.status.replace(/_/g, ' ')}
              </Badge>
              {data.difficulty ? <Badge variant="outline">{data.difficulty}</Badge> : null}
              {data.topic ? (
                <Badge variant="outline">{data.topic.name}</Badge>
              ) : (
                <Badge variant="destructive">No topic mapped</Badge>
              )}
            </div>
            <div>
              <CardTitle className="text-card-title">{data.title}</CardTitle>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{data.statement}</p>
              {(data.assets ?? []).map((asset) =>
                asset.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- reviewer storage asset
                  <img
                    key={asset.key}
                    src={asset.url}
                    alt={asset.altText ?? 'Question illustration'}
                    loading="lazy"
                    className="mt-3 max-h-72 w-auto max-w-full rounded-lg border border-border object-contain"
                  />
                ) : null,
              )}
            </div>
            <ol className="space-y-2">
              {data.options.map((option, index) => (
                <li
                  key={index}
                  className={cn(
                    'rounded-lg border p-3 text-sm',
                    option.isCorrect ? 'border-success/60 bg-success/5' : 'border-border',
                  )}
                >
                  <span className="font-metric mr-2 text-muted-foreground">
                    {String.fromCharCode(65 + index)}.
                  </span>
                  {option.text ? <span>{option.text}</span> : null}
                  {option.assetUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- reviewer storage asset
                    <img
                      src={option.assetUrl}
                      alt={`Option ${String.fromCharCode(65 + index)}`}
                      loading="lazy"
                      className="mt-2 max-h-40 w-auto max-w-full rounded-lg border border-border object-contain"
                    />
                  ) : null}
                  {!option.text && !option.assetUrl ? (
                    <span className="text-muted-foreground">(empty option)</span>
                  ) : null}
                  {option.isCorrect ? (
                    <Badge variant="success" className="ml-2">
                      Answer
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ol>
            {data.explanation ? (
              <div>
                <p className="text-sm font-semibold">Explanation</p>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                  {data.explanation}
                </p>
              </div>
            ) : null}
            {data.sourceUrl ? (
              <p className="text-xs text-muted-foreground">
                Source: <span className="break-all">{data.sourceUrl}</span>
              </p>
            ) : null}
            {data.resultingProblemId ? (
              <p className="text-xs text-muted-foreground">
                Published as problem <span className="font-metric">{data.resultingProblemId}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 p-5 text-sm">
              <CardTitle className="text-card-title">Review info</CardTitle>
              <p>
                <span className="text-muted-foreground">Contributor: </span>
                {data.contributor.displayName}
                {data.contributor.username ? ` (@${data.contributor.username})` : ''}
              </p>
              <p>
                <span className="text-muted-foreground">Submitted: </span>
                {new Date(data.submittedAt).toLocaleString()}
              </p>
              {data.reviewer ? (
                <p>
                  <span className="text-muted-foreground">Reviewer: </span>
                  {data.reviewer.displayName}
                  {data.reviewedAt ? ` · ${new Date(data.reviewedAt).toLocaleString()}` : ''}
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">Section: </span>
                {data.category ? data.category.name : 'Not set'}
              </p>
              <p>
                <span className="text-muted-foreground">Rating: </span>
                <span className="font-metric">{data.rating ?? '—'}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Exam folders: </span>
                {data.examTagSlugs.length > 0 ? data.examTagSlugs.join(', ') : 'None'}
              </p>
              {data.source ? (
                <p>
                  <span className="text-muted-foreground">Source: </span>
                  {data.source}
                </p>
              ) : null}
              {data.reviewerNote ? (
                <p>
                  <span className="text-muted-foreground">Staff note: </span>
                  {data.reviewerNote}
                </p>
              ) : null}
              {data.feedbackForContributor ? (
                <p>
                  <span className="text-muted-foreground">Contributor feedback: </span>
                  {data.feedbackForContributor}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-card-title">Analysis</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={analyze.isPending}
                  onClick={() =>
                    analyze.mutate(undefined, {
                      onSuccess: () => {
                        toast.success('Precheck complete.');
                        void refetch();
                      },
                      onError: (error) => fail(error, 'Analysis failed.'),
                    })
                  }
                >
                  {analyze.isPending ? 'Running…' : 'Run precheck'}
                </Button>
              </div>
              {data.aiReviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No analysis yet. Run the deterministic precheck first.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.aiReviews.map((review) => (
                    <li key={review.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={review.aiGenerated ? 'default' : 'outline'}>
                          {review.aiGenerated ? 'AI · advisory' : 'Precheck'}
                        </Badge>
                        <Badge
                          variant={
                            review.recommendation === 'APPROVE'
                              ? 'success'
                              : review.recommendation === 'REJECT'
                                ? 'destructive'
                                : 'warning'
                          }
                        >
                          {review.recommendation}
                        </Badge>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {review.model}
                        </span>
                      </div>
                      {review.issues.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                          {review.issues.map((issue, index) => (
                            <li key={index}>{issue}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">No issues flagged.</p>
                      )}
                      {review.duplicateProbability !== null ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Top duplicate similarity:{' '}
                          <span className="font-metric">
                            {review.duplicateProbability.toFixed(2)}
                          </span>
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {data.duplicateCandidates.length > 0 ? (
                <div>
                  <p className="text-sm font-semibold">Duplicate candidates (library)</p>
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {data.duplicateCandidates.map((candidate) => (
                      <li key={candidate.problemId}>
                        <span className="font-metric">{candidate.similarity.toFixed(2)}</span> ·{' '}
                        {candidate.title}{' '}
                        <span className="text-muted-foreground">
                          ({candidate.source === 'both' ? 'title + semantic' : candidate.source})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {!decided ? (
            <Card>
              <CardContent className="space-y-3 p-5">
                <CardTitle className="text-card-title">Decision</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Approval publishes to the library. AI output above is advisory only.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setEditNote('');
                    setModifying(true);
                  }}
                >
                  Modify content
                </Button>
                {data.status === 'PENDING' && !data.reviewer ? (
                  <Button
                    variant="outline"
                    disabled={pickup.isPending}
                    onClick={() =>
                      pickup.mutate(undefined, {
                        onSuccess: () => {
                          toast.success('Picked up — other reviewers see you hold it.');
                          void refetch();
                        },
                        onError: (error) => fail(error, 'Pickup failed.'),
                      })
                    }
                  >
                    {pickup.isPending ? 'Picking up…' : 'Pick up for review'}
                  </Button>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <ActionDialog
                    title="Approve"
                    description="Creates a published canonical problem from this contribution. The contributor is notified."
                    needFeedback={false}
                    needTopic
                    topics={(sectionTopics.data ?? []).map((topic) => ({
                      slug: topic.slug,
                      name: topic.name,
                    }))}
                    topicsHint={
                      data.topic
                        ? `Currently mapped: ${data.topic.name}. Pick only to override.`
                        : data.category
                          ? `No topic mapped — pick one from ${data.category.name}.`
                          : 'No section on this contribution — set one via Modify first.'
                    }
                    requireTopic={!data.topic}
                    pending={approve.isPending}
                    onConfirm={(note, _feedback, topicSlug) =>
                      approve.mutate(
                        { note: note || undefined, topicSlug },
                        {
                          onSuccess: () => {
                            toast.success('Contribution approved and published.');
                            void refetch();
                          },
                          onError: (error) => fail(error, 'Approval failed.'),
                        },
                      )
                    }
                  />
                  <ActionDialog
                    title="Reject"
                    description="Rejects permanently with optional contributor feedback. History is preserved."
                    needFeedback={false}
                    pending={reject.isPending}
                    onConfirm={(note, feedback) =>
                      reject.mutate(
                        { note: note || undefined, feedback: feedback || undefined },
                        {
                          onSuccess: () => {
                            toast.success('Contribution rejected.');
                            void refetch();
                          },
                          onError: (error) => fail(error, 'Rejection failed.'),
                        },
                      )
                    }
                  />
                  <ActionDialog
                    title="Request changes"
                    description="Sends back to pending with clear contributor feedback."
                    needFeedback
                    pending={requestChanges.isPending}
                    onConfirm={(note, feedback) =>
                      requestChanges.mutate(
                        { note: note || undefined, feedback },
                        {
                          onSuccess: () => {
                            toast.success('Sent back for changes.');
                            void refetch();
                          },
                          onError: (error) => fail(error, 'Request failed.'),
                        },
                      )
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">
              Decision recorded
              {data.reviewedAt ? ` on ${new Date(data.reviewedAt).toLocaleString()}` : ''}. History
              is preserved.
            </p>
          )}
        </div>
      </div>

      <Dialog open={modifying} onOpenChange={setModifying}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modify submission</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="review-edit-note">Internal note (optional)</Label>
              <Textarea
                id="review-edit-note"
                value={editNote}
                onChange={(event) => setEditNote(event.target.value)}
                rows={2}
                placeholder="What did you change and why…"
              />
            </div>
            <ContributionForm
              key={data.id}
              initial={{
                type: 'QUANTITATIVE',
                difficulty: (data.difficulty as 'EASY' | 'MEDIUM' | 'HARD' | null) ?? 'MEDIUM',
                categorySlug: data.category?.slug ?? '',
                topic: data.topic?.name ?? '',
                rating: data.rating ?? undefined,
                examTagSlugs: data.examTagSlugs,
                source: data.source ?? '',
                statement: data.statement,
                // Preserve images across reviewer edits: snapshot keys ride
                // along untouched unless the reviewer attaches/removes them.
                assets: (data.assets ?? []).map((asset) => ({
                  key: asset.key,
                  kind: asset.kind,
                  mimeType: asset.mimeType as
                    | 'image/jpeg'
                    | 'image/png'
                    | 'image/webp'
                    | 'image/gif'
                    | 'image/avif',
                  sizeBytes: asset.sizeBytes,
                  ...(asset.altText ? { altText: asset.altText } : {}),
                })),
                options: data.options.map((option) => ({
                  text: option.text ?? '',
                  ...(option.assetKey ? { assetKey: option.assetKey } : {}),
                })),
                correctAnswerIndex: Math.max(
                  0,
                  data.options.findIndex((option) => option.isCorrect),
                ),
                explanation: data.explanation ?? '',
                sourceUrl: '',
              }}
              submitLabel="Save modifications"
              onSubmitOverride={(values) =>
                edit.mutateAsync({ ...values, note: editNote.trim() || undefined }).then(() => {
                  setModifying(false);
                  void refetch();
                })
              }
              onSaved={() => undefined}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
