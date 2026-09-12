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
import { QUESTION_DIFFICULTIES, QUESTION_TYPES } from '@apteez/types';

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

const TYPE_LABELS: Record<(typeof QUESTION_TYPES)[number], string> = {
  QUANTITATIVE: 'Quantitative',
  LOGICAL_REASONING: 'Logical reasoning',
  VERBAL: 'Verbal',
  DATA_INTERPRETATION: 'Data interpretation',
};

/**
 * Contribution composer. Validates with the shared schema (the same shape
 * the future review API will accept) and keeps drafts locally until the
 * submission + review workflow ships in a later prompt.
 */
export function ContributionForm({ onSaved }: { onSaved: () => void }): React.JSX.Element {
  const form = useForm<ContributionQuestionInput>({
    resolver: zodResolver(contributionQuestionSchema),
    defaultValues: {
      type: 'QUANTITATIVE',
      difficulty: 'MEDIUM',
      topic: '',
      statement: '',
      options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
      correctAnswerIndex: 0,
      explanation: '',
      sourceUrl: '',
    },
  });

  const { fields } = useFieldArray({ control: form.control, name: 'options' });

  const onSubmit = (values: ContributionQuestionInput): void => {
    const draft: ContributionDraft = {
      ...values,
      id: `draft-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify([...readDrafts(), draft]));
      toast.success('Draft saved', {
        description: 'Stored on this device. Submission and review open soon.',
      });
      form.reset();
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
        <CardTitle>New contribution</CardTitle>
        <CardDescription>
          Draft an original question. Server-side submission and reviewer workflow arrive in a later
          release — drafts stay on this device until then.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Question family</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        {...field}
                      >
                        {QUESTION_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {TYPE_LABELS[type]}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                  <FormDescription>Reviewers check this first — be explicit.</FormDescription>
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

            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving…' : 'Save draft'}
            </Button>
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
          No drafts yet. Compose your first question above — it will appear here.
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
