'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import * as React from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
} from '@apteez/ui';
import { contributionQuestionSchema, type ContributionQuestionInput } from '@apteez/validation';
import { QUESTION_DIFFICULTIES, type QuestionType } from '@apteez/types';
import { ApiError } from '@/lib/api-client';
import { authErrorMessage } from '@/hooks/use-auth';
import { useResubmitContribution, useSubmitContribution } from '@/hooks/use-contributions';
import { useCategories } from '@/hooks/use-problems';
import type { UploadedImage } from '@/hooks/use-upload-image';
import { ImagePicker } from '@/components/problems/image-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@apteez/ui';

const DRAFTS_KEY = 'apteez:contribution-drafts';

export interface ContributionDraft extends ContributionQuestionInput {
  id: string;
  createdAt: string;
}

function readDrafts(): ContributionDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ContributionDraft[]) : [];
  } catch {
    return [];
  }
}

const TYPE_LABELS: Record<QuestionType, string> = {
  QUANTITATIVE: 'Quantitative',
  LOGICAL_REASONING: 'Logical reasoning',
  VERBAL: 'Verbal',
  DATA_INTERPRETATION: 'Data interpretation',
};

/** Section picker wired to the taxonomy (required for every submission). */
function CategorySelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const categories = useCategories();
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || categories.isPending}>
      <SelectTrigger aria-label="Section">
        <SelectValue placeholder={categories.isPending ? 'Loading sections…' : 'Select section'} />
      </SelectTrigger>
      <SelectContent>
        {(categories.data ?? []).map((category) => (
          <SelectItem key={category.slug} value={category.slug}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Comma-separated exam folders, stored as a slug array. */
function ExamTagsInput({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const [text, setText] = React.useState(value.join(', '));
  React.useEffect(() => {
    setText(value.join(', '));
  }, [value.join(', ')]);
  return (
    <Input
      placeholder="ssc, banking"
      value={text}
      disabled={disabled}
      onChange={(event) => {
        setText(event.target.value);
        onChange([
          ...new Set(
            event.target.value
              .split(',')
              .map((part) => part.trim().toLowerCase())
              .filter(Boolean),
          ),
        ]);
      }}
    />
  );
}

function StepCard({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card className="animate-fade-up overflow-hidden">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/50 font-metric text-sm font-extrabold text-primary"
            aria-hidden
          >
            {step}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">{title}</p>
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          </div>
          <span className="h-px flex-1 bg-gradient-to-r from-primary/25 to-transparent" aria-hidden />
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

const EMPTY_VALUES: ContributionQuestionInput = {
  type: 'QUANTITATIVE',
  difficulty: 'MEDIUM',
  categorySlug: '',
  topic: '',
  examTagSlugs: [],
  statement: '',
  assets: [],
  options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
  correctAnswerIndex: 0,
  explanation: '',
  sourceUrl: '',
};

interface StoredImageRef {
  key: string;
  kind: 'QUESTION_IMAGE' | 'EXPLANATION_IMAGE';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/avif';
  sizeBytes: number;
  altText?: string;
}

function toAssetPayload(image: UploadedImage): StoredImageRef {
  if (!isSupportedImageMime(image.contentType)) {
    throw new Error('Unsupported image type.');
  }
  return {
    key: image.key,
    kind: 'QUESTION_IMAGE',
    mimeType: image.contentType,
    sizeBytes: image.size,
  };
}

function isSupportedImageMime(
  mime: string,
): mime is StoredImageRef['mimeType'] {
  return (
    mime === 'image/jpeg' ||
    mime === 'image/png' ||
    mime === 'image/webp' ||
    mime === 'image/gif' ||
    mime === 'image/avif'
  );
}

/**
 * Contribution composer. "Submit for review" POSTs to the review queue
 * (human reviewers are paged); "Save draft" keeps a local copy for offline
 * composing. Also edits your own PENDING submission when `reviseId` is set.
 */
export function ContributionForm({
  onSaved,
  initial,
  reviseId,
  onRevised,
  submitLabel,
  onSubmitOverride,
}: {
  onSaved: () => void;
  initial?: ContributionQuestionInput;
  reviseId?: string;
  onRevised?: () => void;
  /** Reviewer mode: custom CTA + handler instead of the contributor mutations. */
  submitLabel?: string;
  onSubmitOverride?: (values: ContributionQuestionInput) => Promise<unknown>;
}): React.JSX.Element {
  const form = useForm<ContributionQuestionInput>({
    resolver: zodResolver(contributionQuestionSchema),
    defaultValues: initial ?? EMPTY_VALUES,
  });
  const submit = useSubmitContribution();
  const resubmit = useResubmitContribution(reviseId);

  // When revising a different submission, reset the form to its values.
  const initialKey = initial ? JSON.stringify(initial) : '';
  React.useEffect(() => {
    if (initial) {
      form.reset(initial);
      setKeptAssets(initial.assets ?? []);
      resetImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const { fields } = useFieldArray({ control: form.control, name: 'options' });
  const busy = submit.isPending || resubmit.isPending;

  // Images live outside react-hook-form (file uploads, not text inputs) and
  // merge into the payload at submit time. `keptAssets` preserves images
  // already on the submission when revising — revise never drops them.
  const [questionImages, setQuestionImages] = React.useState<UploadedImage[]>([]);
  const [optionImages, setOptionImages] = React.useState<Array<UploadedImage | null>>([]);
  const [keptAssets, setKeptAssets] = React.useState<StoredImageRef[]>(() => initial?.assets ?? []);

  const resetImages = React.useCallback(() => {
    setQuestionImages([]);
    setOptionImages([]);
  }, []);

  const withImages = (values: ContributionQuestionInput): ContributionQuestionInput => ({
    ...values,
    assets: [
      ...keptAssets,
      ...questionImages
        .filter((image) => isSupportedImageMime(image.contentType))
        .map(toAssetPayload),
    ],
    options: values.options.map((option, index) => {
      const image = optionImages[index];
      return image && isSupportedImageMime(image.contentType)
        ? { ...option, assetKey: image.key }
        : option;
    }),
  });

  const submitForReview = (values: ContributionQuestionInput): void => {
    const payload = withImages(values);
    if (onSubmitOverride) {
      void (async () => {
        try {
          await onSubmitOverride(payload);
          toast.success('Modifications saved', {
            description: 'The submission stays in the review queue.',
          });
          form.reset();
          resetImages();
          onRevised?.();
          onSaved();
        } catch (error) {
          toast.error(authErrorMessage(error, 'Could not save.'));
        }
      })();
      return;
    }
    const mutation = reviseId ? resubmit : submit;
    mutation.mutate(payload, {
      onSuccess: () => {
        toast.success(reviseId ? 'Revision saved' : 'Submitted for review', {
          description: reviseId
            ? 'Your updated question is back in the queue.'
            : 'A reviewer has been notified. Track it under My submissions.',
        });
        form.reset();
        resetImages();
        if (reviseId) {
          onRevised?.();
        } else {
          onSaved();
        }
      },
      onError: (error) => {
        toast.error(
          error instanceof ApiError && error.kind === 'server' && error.status === 503
            ? 'Submissions are temporarily disabled. Save a draft and try later.'
            : authErrorMessage(error, 'Could not submit.'),
        );
      },
    });
  };

  const saveDraft = (): void => {
    const values = withImages(form.getValues());
    const draft: ContributionDraft = {
      ...values,
      id: `draft-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify([...readDrafts(), draft]));
      toast.success('Draft saved', { description: 'Stored on this device only.' });
      onSaved();
    } catch {
      toast.error('Could not save the draft', {
        description: 'Browser storage is unavailable. Copy your work and try again.',
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="page-enter overflow-hidden">
        <span className="block h-1 bg-gradient-to-r from-primary via-accent-foreground to-primary" aria-hidden />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {reviseId ? 'Revise contribution' : 'New contribution'}
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-metric text-xs font-bold text-primary">
              4 steps
            </span>
          </CardTitle>
          <CardDescription>
            {reviseId
              ? 'Update your pending question — it stays in the review queue.'
              : 'Draft an original question. Submitting sends it to human review; reviewers are notified automatically.'}
          </CardDescription>
        </CardHeader>
      </Card>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(submitForReview)} className="space-y-4" noValidate>
          <StepCard step={1} title="Classify it" hint="Where this question lives in the library">
            <FormField
              control={form.control}
              name="difficulty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Difficulty</FormLabel>
                  <FormControl>
                    <div className="flex gap-1.5 rounded-xl bg-muted/60 p-1.5" role="group" aria-label="Difficulty">
                      {QUESTION_DIFFICULTIES.map((difficulty) => (
                        <button
                          key={difficulty}
                          type="button"
                          onClick={() => field.onChange(difficulty)}
                          aria-pressed={field.value === difficulty}
                          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 ${
                            field.value === difficulty
                              ? difficulty === 'EASY'
                                ? 'bg-success text-success-foreground shadow-md'
                                : difficulty === 'MEDIUM'
                                  ? 'bg-warning text-warning-foreground shadow-md'
                                  : 'bg-destructive text-destructive-foreground shadow-md'
                              : 'text-muted-foreground hover:bg-background hover:text-foreground'
                          }`}
                        >
                          {difficulty.charAt(0) + difficulty.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="categorySlug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section *</FormLabel>
                    <FormControl>
                      <CategorySelect
                        value={field.value}
                        onChange={field.onChange}
                        disabled={busy}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Rating <span className="font-normal text-muted-foreground">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="1500"
                        inputMode="numeric"
                        value={field.value ?? ''}
                        onChange={(event) => {
                          const raw = event.target.value.replace(/\D/g, '').slice(0, 4);
                          field.onChange(raw ? Number(raw) : undefined);
                        }}
                      />
                    </FormControl>
                    <FormDescription>1000–2000, whole hundreds. Defaults to 1500.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="topic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Topic <span className="font-normal text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Time and work" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="examTagSlugs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Exam folders{' '}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <ExamTagsInput
                        value={field.value ?? []}
                        onChange={field.onChange}
                        disabled={busy}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Source <span className="font-normal text-muted-foreground">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. SSC CGL 2023"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

          </StepCard>

          <StepCard step={2} title="Ask it" hint="The exact words a solver will read">
            <FormField
              control={form.control}
              name="statement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question statement</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Write the full question a solver will see…"
                      className="min-h-[110px] transition-all focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    At least 20 characters — write it exactly as a solver sees it.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <p className="text-sm font-medium">
                Question images{' '}
                <span className="font-normal text-muted-foreground">(optional, up to 4)</span>
              </p>
              {keptAssets.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {keptAssets.length} attached image{keptAssets.length === 1 ? '' : 's'} kept from
                  the current submission.
                </p>
              ) : null}
              {questionImages.map((image, index) => (
                <ImagePicker
                  key={image.key}
                  label={`Image ${keptAssets.length + index + 1}`}
                  value={image}
                  onChange={(next) =>
                    setQuestionImages((current) =>
                      next ? current.map((entry) => (entry.key === image.key ? next : entry)) : current.filter((entry) => entry.key !== image.key),
                    )
                  }
                />
              ))}
              {keptAssets.length + questionImages.length < 4 ? (
                <ImagePicker
                  label={questionImages.length === 0 ? 'Attach an image' : 'Attach another image'}
                  value={null}
                  onChange={(next) =>
                    setQuestionImages((current) => (next ? [...current, next] : current))
                  }
                />
              ) : null}
            </div>
          </StepCard>

          <StepCard step={3} title="Answer it" hint="Four options — mark the one true answer">
            <div className="space-y-3">
              {fields.map((option, index) => {
                const isCorrect = form.watch('correctAnswerIndex') === index;
                return (
                <FormField
                  key={option.id}
                  control={form.control}
                  name={`options.${index}.text`}
                  render={({ field }) => (
                    <FormItem>
                      <div
                        className={`flex items-center gap-2 rounded-xl border p-2 transition-all duration-200 ${
                          isCorrect
                            ? 'border-success/50 bg-success/[0.06] shadow-[0_0_20px_-8px_hsl(var(--success)/0.5)]'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-lg font-metric text-xs font-extrabold transition-colors ${
                            isCorrect ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
                          }`}
                          aria-hidden
                        >
                          {String.fromCharCode(65 + index)}
                        </span>
                        <FormControl>
                          <Input
                            placeholder={`Option ${index + 1}`}
                            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                            {...field}
                          />
                        </FormControl>
                        <label
                          className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                            isCorrect ? 'bg-success/15 text-success' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                          }`}
                        >
                          <input
                            type="radio"
                            name="correctAnswerIndex"
                            value={index}
                            checked={isCorrect}
                            onChange={() => form.setValue('correctAnswerIndex', index)}
                            className="size-4 accent-success"
                          />
                          Correct
                        </label>
                      </div>
                      <ImagePicker
                        label={`Option ${index + 1} image (optional)`}
                        value={optionImages[index] ?? null}
                        onChange={(next) =>
                          setOptionImages((current) => {
                            const nextImages = [...current];
                            nextImages[index] = next;
                            return nextImages;
                          })
                        }
                        compact
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                );
              })}
              {form.formState.errors.correctAnswerIndex ? (
                <p className="animate-fade-in rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                  {form.formState.errors.correctAnswerIndex.message}
                </p>
              ) : null}
            </div>
          </StepCard>

          <StepCard step={4} title="Explain it" hint="Reviewers read this first — be explicit">
            <FormField
              control={form.control}
              name="explanation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Explanation</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Why is the answer correct? Show the working…"
                      className="min-h-[110px] transition-all focus:border-primary/60 focus:ring-2 focus:ring-ring/40"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    At least 20 characters. Reviewers check this first — be explicit.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sourceUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Source URL <span className="font-normal text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="https://…" inputMode="url" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </StepCard>

          <div className="glass sticky bottom-20 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border p-3 shadow-xl lg:bottom-4">
            <p className="mr-auto hidden text-xs text-muted-foreground sm:block">
              {reviseId ? 'Revision stays in the review queue.' : 'Human review · usually within days'}
            </p>
            {!reviseId && !onSubmitOverride ? (
              <Button type="button" variant="outline" onClick={saveDraft} className="transition-all hover:-translate-y-0.5">
                Save draft
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={busy || form.formState.isSubmitting}
              className="btn-sheen min-w-44 shadow-lg shadow-primary/25 transition-all duration-300 hover:-translate-y-0.5 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {busy ? (
                <span className="typing-dots">Sending</span>
              ) : (
                <>{submitLabel ?? (reviseId ? 'Save revision' : 'Submit for review')}</>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export function DraftsList({ refreshSignal }: { refreshSignal: number }): React.JSX.Element {
  const [drafts, setDrafts] = React.useState<ContributionDraft[]>([]);

  React.useEffect(() => {
    setDrafts(readDrafts());
  }, [refreshSignal]);

  const removeDraft = (id: string): void => {
    const remaining = readDrafts().filter((draft) => draft.id !== id);
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(remaining));
    } catch {
      // Storage unavailable — still update the visible list.
    }
    setDrafts(remaining);
    toast.success('Draft deleted');
  };

  if (drafts.length === 0) {
    return (
      <Card className="animate-scale-in border-dashed border-primary/30 bg-primary/[0.03]">
        <CardContent className="flex items-center gap-3 p-5">
          <span className="icon-tile size-10 shrink-0" aria-hidden>
            <span className="text-sm font-extrabold">✎</span>
          </span>
          <p className="text-sm text-muted-foreground">
            No drafts on this device. Compose above — submitting sends it straight to review.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {drafts.map((draft, index) => (
        <div
          key={draft.id}
          className="row-enter"
          style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
        >
        <Card className="card-lift">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="icon-tile size-9 shrink-0" aria-hidden>
              <span className="text-xs font-extrabold">{draft.statement.trim().charAt(0).toUpperCase() || '?'}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{draft.statement || 'Untitled draft'}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {TYPE_LABELS[draft.type]} ·{' '}
                {draft.difficulty.charAt(0) + draft.difficulty.slice(1).toLowerCase()}
                {draft.topic ? ` · ${draft.topic}` : ''} · saved{' '}
                {new Date(draft.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete draft"
              onClick={() => removeDraft(draft.id)}
              className="shrink-0 transition-all duration-200 hover:rotate-6 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 aria-hidden />
            </Button>
          </CardContent>
        </Card>
        </div>
      ))}
    </div>
  );
}
