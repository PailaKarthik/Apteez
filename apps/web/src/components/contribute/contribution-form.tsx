'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Trash2 } from 'lucide-react';
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

const EMPTY_VALUES: ContributionQuestionInput = {
  type: 'QUANTITATIVE',
  difficulty: 'MEDIUM',
  categorySlug: '',
  topic: '',
  examTagSlugs: [],
  statement: '',
  options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
  correctAnswerIndex: 0,
  explanation: '',
  sourceUrl: '',
};

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const { fields } = useFieldArray({ control: form.control, name: 'options' });
  const busy = submit.isPending || resubmit.isPending;

  const submitForReview = (values: ContributionQuestionInput): void => {
    if (onSubmitOverride) {
      void (async () => {
        try {
          await onSubmitOverride(values);
          toast.success('Modifications saved', {
            description: 'The submission stays in the review queue.',
          });
          form.reset();
          onRevised?.();
          onSaved();
        } catch (error) {
          toast.error(authErrorMessage(error, 'Could not save.'));
        }
      })();
      return;
    }
    const mutation = reviseId ? resubmit : submit;
    mutation.mutate(values, {
      onSuccess: () => {
        toast.success(reviseId ? 'Revision saved' : 'Submitted for review', {
          description: reviseId
            ? 'Your updated question is back in the queue.'
            : 'A reviewer has been notified. Track it under My submissions.',
        });
        form.reset();
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
    const values = form.getValues();
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
    <Card>
      <CardHeader>
        <CardTitle>{reviseId ? 'Revise contribution' : 'New contribution'}</CardTitle>
        <CardDescription>
          {reviseId
            ? 'Update your pending question — it stays in the review queue.'
            : 'Draft an original question. Submitting sends it to human review; reviewers are notified automatically.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submitForReview)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="difficulty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Difficulty</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      {...field}
                    >
                      {QUESTION_DIFFICULTIES.map((difficulty) => (
                        <option key={difficulty} value={difficulty}>
                          {difficulty.charAt(0) + difficulty.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
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

            <FormField
              control={form.control}
              name="statement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question statement</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Write the full question a solver will see…"
                      className="min-h-[110px]"
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

            <div className="space-y-3">
              <p className="text-sm font-medium">Answer options</p>
              {fields.map((option, index) => (
                <FormField
                  key={option.id}
                  control={form.control}
                  name={`options.${index}.text`}
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <Input placeholder={`Option ${index + 1}`} {...field} />
                        </FormControl>
                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="radio"
                            name="correctAnswerIndex"
                            value={index}
                            checked={form.watch('correctAnswerIndex') === index}
                            onChange={() => form.setValue('correctAnswerIndex', index)}
                            className="size-4 accent-violet-600"
                          />
                          Correct
                        </label>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              {form.formState.errors.correctAnswerIndex ? (
                <p className="text-xs font-medium text-destructive">
                  {form.formState.errors.correctAnswerIndex.message}
                </p>
              ) : null}
            </div>

            <FormField
              control={form.control}
              name="explanation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Explanation</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Why is the answer correct? Show the working…"
                      className="min-h-[110px]"
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

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || form.formState.isSubmitting}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {submitLabel ?? (reviseId ? 'Save revision' : 'Submit for review')}
              </Button>
              {!reviseId && !onSubmitOverride ? (
                <Button type="button" variant="outline" onClick={saveDraft}>
                  Save draft
                </Button>
              ) : null}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
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
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          No drafts on this device. Compose above — submitting sends it straight to review.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {drafts.map((draft) => (
        <Card key={draft.id}>
          <CardContent className="flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{draft.statement}</p>
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
            >
              <Trash2 aria-hidden />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
