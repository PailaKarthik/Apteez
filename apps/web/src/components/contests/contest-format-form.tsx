'use client';

import { Loader2 } from 'lucide-react';
import * as React from 'react';
import type { ContestManageDto } from '@apteez/types';
import type { ContestCreateInput, OrganizerContestPatchInput } from '@apteez/validation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@apteez/ui';

export interface ContestFormatValues {
  questionCount: number;
  durationMinutes: number;
  title: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  maxParticipants: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  description: string;
  rules: string;
  resultVisibility: 'ALWAYS' | 'AFTER_END' | 'AFTER_REGISTRATION_CLOSE';
  revealAnswersLive: boolean;
}

/** datetime-local value (YYYY-MM-DDTHH:mm) from an ISO string. */
export function toLocalInput(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function manageToValues(manage: ContestManageDto): ContestFormatValues {
  return {
    questionCount: manage.questionCount,
    durationMinutes: manage.durationMinutes,
    title: manage.title,
    startsAt: toLocalInput(manage.startsAt),
    endsAt: toLocalInput(manage.endsAt),
    registrationOpensAt: toLocalInput(manage.registrationOpensAt),
    registrationClosesAt: toLocalInput(manage.registrationClosesAt),
    maxParticipants: manage.maxParticipants?.toString() ?? '',
    difficulty: manage.difficulty,
    description: manage.description ?? '',
    rules: manage.rules ?? '',
    resultVisibility: manage.resultVisibility,
    revealAnswersLive: manage.revealAnswersLive,
  };
}

export function defaultValues(): ContestFormatValues {
  const start = new Date(Date.now() + 24 * 3600_000);
  const end = new Date(Date.now() + 26 * 3600_000);
  return {
    questionCount: 10,
    durationMinutes: 60,
    title: '',
    startsAt: toLocalInput(start.toISOString()),
    endsAt: toLocalInput(end.toISOString()),
    registrationOpensAt: '',
    registrationClosesAt: '',
    maxParticipants: '',
    difficulty: 'MEDIUM',
    description: '',
    rules: '',
    resultVisibility: 'AFTER_END',
    revealAnswersLive: false,
  };
}

export function toCreateInput(values: ContestFormatValues): ContestCreateInput {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    rules: values.rules.trim() || null,
    difficulty: values.difficulty,
    questionCount: values.questionCount,
    durationMinutes: values.durationMinutes,
    startsAt: new Date(values.startsAt),
    endsAt: new Date(values.endsAt),
    registrationOpensAt: values.registrationOpensAt ? new Date(values.registrationOpensAt) : null,
    registrationClosesAt: values.registrationClosesAt
      ? new Date(values.registrationClosesAt)
      : null,
    maxParticipants: values.maxParticipants ? Number(values.maxParticipants) : undefined,
    resultVisibility: values.resultVisibility,
    revealAnswersLive: values.revealAnswersLive,
  };
}

export function toPatchInput(values: ContestFormatValues): OrganizerContestPatchInput {
  const create = toCreateInput(values);
  return {
    title: create.title,
    description: create.description,
    rules: create.rules,
    difficulty: create.difficulty,
    questionCount: create.questionCount,
    durationMinutes: create.durationMinutes,
    startsAt: create.startsAt,
    endsAt: create.endsAt,
    registrationOpensAt: create.registrationOpensAt,
    registrationClosesAt: create.registrationClosesAt,
    maxParticipants: values.maxParticipants ? Number(values.maxParticipants) : null,
    resultVisibility: create.resultVisibility,
    revealAnswersLive: create.revealAnswersLive,
  };
}

/**
 * Step 1 of contest creation: the format. Question count + length come first
 * (they size everything downstream), then identity, schedule, and rules.
 * Also reused for draft edits with initial values + a different CTA.
 */
export function ContestFormatForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  initial: ContestFormatValues;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (values: ContestFormatValues) => void;
}): React.JSX.Element {
  const [values, setValues] = React.useState<ContestFormatValues>(initial);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const set = <K extends keyof ContestFormatValues>(key: K, value: ContestFormatValues[K]): void =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!values.title.trim()) {
      setLocalError('Give the contest a title.');
      return;
    }
    if (!values.startsAt || !values.endsAt) {
      setLocalError('Set both the start and the end time.');
      return;
    }
    if (new Date(values.endsAt) <= new Date(values.startsAt)) {
      setLocalError('The end must be after the start.');
      return;
    }
    if (
      values.registrationOpensAt &&
      values.registrationClosesAt &&
      new Date(values.registrationClosesAt) <= new Date(values.registrationOpensAt)
    ) {
      setLocalError('Registration close must be after registration open.');
      return;
    }
    setLocalError(null);
    onSubmit(values);
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Badge>Step 1</Badge>
            <h2 className="text-section-title text-foreground">Format — size it first</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contest-qcount">Number of questions *</Label>
              <Input
                id="contest-qcount"
                type="number"
                min={1}
                max={50}
                required
                value={values.questionCount}
                onChange={(event) =>
                  set('questionCount', Math.max(1, Math.min(50, Number(event.target.value) || 1)))
                }
              />
              <p className="text-xs text-muted-foreground">
                You will add exactly this many questions one by one next.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contest-duration">Contest length (minutes) *</Label>
              <Input
                id="contest-duration"
                type="number"
                min={5}
                max={180}
                required
                value={values.durationMinutes}
                onChange={(event) =>
                  set(
                    'durationMinutes',
                    Math.max(5, Math.min(180, Number(event.target.value) || 5)),
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Each participant&apos;s clock once they enter (5–180 min).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="text-section-title text-foreground">Identity & schedule</h2>
          <div className="space-y-2">
            <Label htmlFor="contest-title">Title *</Label>
            <Input
              id="contest-title"
              value={values.title}
              maxLength={160}
              placeholder="Weekly Aptitude Sprint"
              onChange={(event) => set('title', event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contest-start">Starts at *</Label>
              <Input
                id="contest-start"
                type="datetime-local"
                required
                value={values.startsAt}
                onChange={(event) => set('startsAt', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contest-end">Ends at *</Label>
              <Input
                id="contest-end"
                type="datetime-local"
                required
                value={values.endsAt}
                onChange={(event) => set('endsAt', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contest-regopen">Registration opens (optional)</Label>
              <Input
                id="contest-regopen"
                type="datetime-local"
                value={values.registrationOpensAt}
                onChange={(event) => set('registrationOpensAt', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contest-regclose">Registration closes (optional)</Label>
              <Input
                id="contest-regclose"
                type="datetime-local"
                value={values.registrationClosesAt}
                onChange={(event) => set('registrationClosesAt', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contest-max">Max participants (optional)</Label>
              <Input
                id="contest-max"
                type="number"
                min={2}
                max={10000}
                placeholder="Unlimited"
                value={values.maxParticipants}
                onChange={(event) => set('maxParticipants', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contest-difficulty">Labelled difficulty</Label>
              <Select
                value={values.difficulty}
                onValueChange={(value: 'EASY' | 'MEDIUM' | 'HARD') => set('difficulty', value)}
              >
                <SelectTrigger id="contest-difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EASY">Easy</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HARD">Hard</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Cosmetic label — every contest mixes easy→hard questions.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contest-desc">Description</Label>
            <Textarea
              id="contest-desc"
              rows={3}
              maxLength={5000}
              value={values.description}
              placeholder="What is this contest about?"
              onChange={(event) => set('description', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contest-rules">Rules</Label>
            <Textarea
              id="contest-rules"
              rows={3}
              maxLength={10000}
              value={values.rules}
              placeholder="Fullscreen required, no tab switching, …"
              onChange={(event) => set('rules', event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contest-visibility">Result visibility</Label>
              <Select
                value={values.resultVisibility}
                onValueChange={(value: 'ALWAYS' | 'AFTER_END' | 'AFTER_REGISTRATION_CLOSE') =>
                  set('resultVisibility', value)
                }
              >
                <SelectTrigger id="contest-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AFTER_END">After the contest ends</SelectItem>
                  <SelectItem value="AFTER_REGISTRATION_CLOSE">
                    After registration closes
                  </SelectItem>
                  <SelectItem value="ALWAYS">Always visible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input
                id="contest-reveal"
                type="checkbox"
                className="size-4 accent-primary"
                checked={values.revealAnswersLive}
                onChange={(event) => set('revealAnswersLive', event.target.checked)}
              />
              <Label htmlFor="contest-reveal">Reveal answers while live</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {localError || error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {localError ?? error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {submitLabel}
      </Button>
    </form>
  );
}
