'use client';

import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import type { QuestionDifficulty } from '@apteez/types';
import { difficultyForRating } from '@apteez/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@apteez/ui';
import { ApiError } from '@/lib/api-client';
import { useCreateAdminProblem } from '@/hooks/use-admin';
import { useCategories, useCategoryTopics, useExamTags } from '@/hooks/use-problems';

interface DraftOption {
  text: string;
  isCorrect: boolean;
}

export const NO_TOPIC = '__none';

const emptyOptions = (): DraftOption[] => [
  { text: '', isCorrect: true },
  { text: '', isCorrect: false },
];

/** Pure body builder (unit-tested): optionality + rating rounding in one place. */
export function buildProblemBody(args: {
  title: string;
  statement: string;
  explanation: string;
  difficulty: '' | QuestionDifficulty;
  rating: string;
  categorySlug: string;
  topicSlug: string;
  subtopicSlug: string;
  examTagInput: string;
  options: DraftOption[];
}): Record<string, unknown> {
  const ratingValue = Math.min(2000, Math.max(1000, Math.round(Number(args.rating) / 100) * 100));
  const examTagSlugs = [
    ...new Set(
      args.examTagInput
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
  return {
    title: args.title.trim(),
    statement: args.statement.trim(),
    ...(args.explanation.trim() ? { explanation: args.explanation.trim() } : {}),
    ...(args.difficulty ? { difficulty: args.difficulty } : {}),
    rating: ratingValue,
    categorySlug: args.categorySlug,
    ...(args.topicSlug !== NO_TOPIC ? { topicSlug: args.topicSlug } : {}),
    ...(args.topicSlug !== NO_TOPIC && args.subtopicSlug !== NO_TOPIC
      ? { subtopicSlug: args.subtopicSlug }
      : {}),
    examTagSlugs,
    options: args.options
      .map((option) => ({ text: option.text.trim(), isCorrect: option.isCorrect }))
      .filter((option) => option.text.length > 0),
  };
}

/**
 * Direct problem creation (Admin → Problems → New). Section (category) is
 * required; topic and subtopic are optional and cascade from the section —
 * the topic list always shows the section's full set. Rating drives
 * difficulty unless overridden (1000–1200 Easy, 1300–1600 Medium, 1700–2000
 * Hard). Goes live the moment it is created.
 */
export interface CreatedProblem {
  id: string;
  title: string;
}

export function NewProblemDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created?: CreatedProblem) => void;
}): React.JSX.Element {
  const create = useCreateAdminProblem();
  const categories = useCategories();
  const [categorySlug, setCategorySlug] = React.useState('');
  const topics = useCategoryTopics(categorySlug || undefined);
  const examTags = useExamTags();

  const [title, setTitle] = React.useState('');
  const [statement, setStatement] = React.useState('');
  const [explanation, setExplanation] = React.useState('');
  const [topicSlug, setTopicSlug] = React.useState(NO_TOPIC);
  const [subtopicSlug, setSubtopicSlug] = React.useState(NO_TOPIC);
  const [rating, setRating] = React.useState('1500');
  const [difficulty, setDifficulty] = React.useState<'' | QuestionDifficulty>('');
  const [options, setOptions] = React.useState<DraftOption[]>(emptyOptions);
  const [examTagInput, setExamTagInput] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const reset = (): void => {
    setTitle('');
    setStatement('');
    setExplanation('');
    setCategorySlug('');
    setTopicSlug(NO_TOPIC);
    setSubtopicSlug(NO_TOPIC);
    setRating('1500');
    setDifficulty('');
    setOptions(emptyOptions());
    setExamTagInput('');
    setFieldErrors({});
    create.reset();
  };

  const band = difficultyForRating(Number(rating) || 1500);
  const topicList = topics.data ?? [];
  const activeTopic = topicList.find((topic) => topic.slug === topicSlug) ?? null;
  const subtopicList = activeTopic?.subtopics ?? [];

  /** Catch the preventable failures locally so the server only ever sees valid payloads. */
  const validateLocal = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (title.trim().length < 3) {
      errors.title = 'Give it a title of at least 3 characters.';
    }
    if (!categorySlug) {
      errors.categorySlug = 'Pick the section this problem belongs to.';
    }
    if (statement.trim().length === 0) {
      errors.statement = 'Write the question statement.';
    }
    const filled = options.filter((option) => option.text.trim().length > 0);
    if (filled.length < 2) {
      errors.options = 'Fill in at least two answer options.';
    }
    const ratingValue = Number(rating);
    if (!Number.isFinite(ratingValue) || ratingValue < 1000 || ratingValue > 2000) {
      errors.rating = 'Rating must be between 1000 and 2000.';
    }
    return errors;
  };

  /** Service-level 400s carry the real reason in the message — pin it to the field. */
  const mapServiceError = (message: string): Record<string, string> => {
    const lower = message.toLowerCase();
    if (lower.includes('category')) {
      return { categorySlug: message };
    }
    if (lower.includes('subtopic')) {
      return { subtopicSlug: message };
    }
    if (lower.includes('topic')) {
      return { topicSlug: message };
    }
    if (lower.includes('exam')) {
      return { examTagInput: message };
    }
    if (lower.includes('option') || lower.includes('correct')) {
      return { options: message };
    }
    if (lower.includes('rating')) {
      return { rating: message };
    }
    return {};
  };

  const submit = (): void => {
    const local = validateLocal();
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      toast.error('Fix the highlighted fields.');
      return;
    }
    setFieldErrors({});
    create.mutate(
      buildProblemBody({
        title,
        statement,
        explanation,
        difficulty,
        rating,
        categorySlug,
        topicSlug,
        subtopicSlug,
        examTagInput,
        options,
      }),
      {
        onSuccess: (result) => {
          toast.success(`"${result.title}" published to the library.`);
          onCreated({ id: result.id, title: result.title });
          onOpenChange(false);
          reset();
        },
        onError: (error) => {
          if (error instanceof ApiError && error.kind === 'validation' && error.details) {
            const mapped: Record<string, string> = {};
            for (const detail of error.details) {
              mapped[detail.field] = detail.message;
            }
            setFieldErrors(mapped);
            toast.error('Fix the highlighted fields.');
            return;
          }
          const message =
            error instanceof ApiError ? error.message : 'Could not create the problem.';
          const mapped = mapServiceError(message);
          if (Object.keys(mapped).length > 0) {
            setFieldErrors(mapped);
          }
          toast.error(message);
        },
      },
    );
  };

  const setOptionText = (index: number, text: string): void => {
    setOptions((current) =>
      current.map((option, i) => (i === index ? { ...option, text } : option)),
    );
  };
  const markCorrect = (index: number): void => {
    setOptions((current) => current.map((option, i) => ({ ...option, isCorrect: i === index })));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          reset();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New problem</DialogTitle>
          <DialogDescription>
            Section is required; topic and subtopic are optional. Difficulty follows the rating band
            ({band}) unless overridden.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-problem-title">Title</Label>
            <Input
              id="new-problem-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Time and work: two workers"
              maxLength={200}
            />
            {fieldErrors.title ? <FieldError message={fieldErrors.title} /> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Section *</span>
              <Select
                value={categorySlug}
                onValueChange={(value) => {
                  setCategorySlug(value);
                  setTopicSlug(NO_TOPIC);
                  setSubtopicSlug(NO_TOPIC);
                }}
              >
                <SelectTrigger aria-label="Section">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {(categories.data ?? []).map((category) => (
                    <SelectItem key={category.slug} value={category.slug}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.categorySlug ? <FieldError message={fieldErrors.categorySlug} /> : null}
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Topic (optional)</span>
              <Select
                value={topicSlug}
                onValueChange={(value) => {
                  setTopicSlug(value);
                  setSubtopicSlug(NO_TOPIC);
                }}
                disabled={!categorySlug || topics.isPending}
              >
                <SelectTrigger aria-label="Topic">
                  <SelectValue
                    placeholder={
                      !categorySlug
                        ? 'Pick a section first'
                        : topics.isPending
                          ? 'Loading topics…'
                          : 'No topic'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TOPIC}>No topic</SelectItem>
                  {topicList.map((topic) => (
                    <SelectItem key={topic.slug} value={topic.slug}>
                      {topic.name} ({topic.problemCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {topics.isError ? (
                <button
                  type="button"
                  className="text-xs text-destructive underline-offset-2 hover:underline"
                  onClick={() => void topics.refetch()}
                >
                  Couldn&apos;t load topics — retry
                </button>
              ) : categorySlug && !topics.isPending ? (
                <p className="text-xs text-muted-foreground">
                  {topicList.length} topic{topicList.length === 1 ? '' : 's'} in this section
                </p>
              ) : null}
              {fieldErrors.topicSlug ? <FieldError message={fieldErrors.topicSlug} /> : null}
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Subtopic (optional)</span>
              <Select
                value={subtopicSlug}
                onValueChange={setSubtopicSlug}
                disabled={!activeTopic || subtopicList.length === 0}
              >
                <SelectTrigger aria-label="Subtopic">
                  <SelectValue
                    placeholder={
                      !activeTopic
                        ? 'Pick a topic first'
                        : subtopicList.length === 0
                          ? 'None under this topic'
                          : 'No subtopic'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TOPIC}>No subtopic</SelectItem>
                  {subtopicList.map((subtopic) => (
                    <SelectItem key={subtopic.slug} value={subtopic.slug}>
                      {subtopic.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.subtopicSlug ? <FieldError message={fieldErrors.subtopicSlug} /> : null}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-problem-rating">Rating (1000–2000, hundreds)</Label>
              <Input
                id="new-problem-rating"
                value={rating}
                onChange={(event) => setRating(event.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
              />
              {fieldErrors.rating ? <FieldError message={fieldErrors.rating} /> : null}
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Difficulty (auto: {band})</span>
              <Select
                value={difficulty || 'auto'}
                onValueChange={(value) =>
                  setDifficulty(value === 'auto' ? '' : (value as QuestionDifficulty))
                }
              >
                <SelectTrigger aria-label="Difficulty override">
                  <SelectValue placeholder="Auto from rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto from rating</SelectItem>
                  <SelectItem value="EASY">Easy</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HARD">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-problem-statement">Statement</Label>
            <textarea
              id="new-problem-statement"
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              rows={4}
              placeholder="A does a work in 10 days…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {fieldErrors.statement ? <FieldError message={fieldErrors.statement} /> : null}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Options (exactly one correct)</span>
              {options.length < 8 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setOptions((current) => [...current, { text: '', isCorrect: false }])
                  }
                >
                  Add option
                </Button>
              ) : null}
            </div>
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="new-problem-correct"
                  checked={option.isCorrect}
                  onChange={() => markCorrect(index)}
                  aria-label={`Mark option ${index + 1} correct`}
                  className="size-4 shrink-0 accent-primary"
                />
                <Input
                  value={option.text}
                  onChange={(event) => setOptionText(index, event.target.value)}
                  placeholder={`Option ${index + 1}`}
                  aria-label={`Option ${index + 1} text`}
                />
                {options.length > 2 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setOptions((current) => {
                        const next = current.filter((_, i) => i !== index);
                        return next.some((entry) => entry.isCorrect)
                          ? next
                          : next.map((entry, i) =>
                              i === 0 ? { ...entry, isCorrect: true } : entry,
                            );
                      })
                    }
                    aria-label={`Remove option ${index + 1}`}
                  >
                    ✕
                  </Button>
                ) : null}
              </div>
            ))}
            {fieldErrors.options ? <FieldError message={fieldErrors.options} /> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-problem-explanation">Explanation (optional)</Label>
            <textarea
              id="new-problem-explanation"
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              rows={3}
              placeholder="Why the answer is correct…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-problem-exams">
              Exam folders (optional, comma-separated slugs)
            </Label>
            <Input
              id="new-problem-exams"
              value={examTagInput}
              onChange={(event) => setExamTagInput(event.target.value)}
              placeholder="ssc, banking"
            />
            {(examTags.data ?? []).length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Available: {(examTags.data ?? []).map((tag) => tag.slug).join(', ')}
              </p>
            ) : null}
            {fieldErrors.examTagInput ? <FieldError message={fieldErrors.examTagInput} /> : null}
          </div>
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Goes live in the library the moment you create it.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden /> Creating…
                </>
              ) : (
                'Create problem'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ message }: { message: string }): React.JSX.Element {
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}
