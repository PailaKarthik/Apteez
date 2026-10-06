'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
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
import { ApiError } from '@/lib/api-client';
import {
  useCreateEvent,
  useCreateOrganization,
  useOrganizations,
  usePublishEvent,
} from '@/hooks/use-events';
import { useProblemsFeed } from '@/hooks/use-problems';
import { NewProblemDialog, type CreatedProblem } from '@/components/admin/new-problem-dialog';

const STEPS = ['Basic', 'Type', 'Visibility', 'Questions', 'Rules', 'Schedule', 'Review'] as const;

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventCreateWizard(): React.JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState('CONTEST');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [organizationId, setOrganizationId] = useState('');
  const [difficulty, setDifficulty] = useState('MEDIUM');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [rules, setRules] = useState('');
  const [startAt, setStartAt] = useState(() =>
    toLocalInput(new Date(Date.now() + 86400000).toISOString()),
  );
  const [endAt, setEndAt] = useState(() =>
    toLocalInput(new Date(Date.now() + 2 * 86400000).toISOString()),
  );
  const [regEnd, setRegEnd] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [entryCode, setEntryCode] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [creatingProblem, setCreatingProblem] = useState(false);
  const [freshProblems, setFreshProblems] = useState<CreatedProblem[]>([]);

  /** Fresh problem for this event: created published, auto-selected below. */
  const createAndSelect = (created: CreatedProblem | undefined): void => {
    if (!created) {
      return;
    }
    setFreshProblems((prev) =>
      prev.some((p) => p.id === created.id) ? prev : [created, ...prev],
    );
    setSelected((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
    toast.success(`"${created.title}" created and selected.`);
  };

  const create = useCreateEvent();
  const publish = usePublishEvent(createdId ?? undefined);
  const [orgSearch, setOrgSearch] = useState('');
  const { data: orgs, isError: orgsError, refetch: refetchOrgs } = useOrganizations(orgSearch);
  const createOrg = useCreateOrganization();
  const [newOrgName, setNewOrgName] = useState('');

  const slugifyOrg = (name: string): string =>
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

  const onAddOrg = (): void => {
    const name = newOrgName.trim();
    const slug = slugifyOrg(name);
    if (name.length < 2 || slug.length < 2) {
      toast.error('Type the full university name first.');
      return;
    }
    createOrg.mutate(
      { name, slug },
      {
        onSuccess: (org) => {
          setOrganizationId(org.id);
          setNewOrgName('');
          // Clear any search filter so the full directory (incl. the new
          // college) reloads — otherwise the selection would point at an
          // option that isn't in the filtered list.
          setOrgSearch('');
          toast.success(`"${name}" added — selected.`);
          void refetchOrgs();
        },
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : 'Could not add that university.'),
      },
    );
  };
  const { problems: problemItems } = useProblemsFeed({}, 20);

  const payload = useMemo(
    () => ({
      title: title.trim(),
      description: description.trim(),
      eventType,
      visibility,
      ...(visibility === 'UNIVERSITY' && organizationId ? { organizationId } : {}),
      difficulty,
      ...(maxParticipants ? { maxParticipants: Number(maxParticipants) } : {}),
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      ...(regEnd ? { registrationEndAt: new Date(regEnd).toISOString() } : {}),
      durationMinutes: Number(durationMinutes) || 60,
      ...(rules.trim() ? { rules: rules.trim() } : {}),
      ...(visibility === 'PRIVATE' && entryCode.trim() ? { entryCode: entryCode.trim() } : {}),
      problemIds: selected,
    }),
    [
      title,
      description,
      eventType,
      visibility,
      organizationId,
      difficulty,
      maxParticipants,
      startAt,
      endAt,
      regEnd,
      durationMinutes,
      rules,
      entryCode,
      selected,
    ],
  );

  const canNext = useMemo(() => {
    if (step === 0) {
      return title.trim().length >= 5 && description.trim().length >= 20;
    }
    if (step === 2) {
      return visibility !== 'UNIVERSITY' || Boolean(organizationId);
    }
    if (step === 3) {
      return true;
    }
    if (step === 5) {
      return new Date(payload.endAt) > new Date(payload.startAt);
    }
    return true;
  }, [step, title, description, visibility, organizationId, payload]);

  const onCreate = (): void => {
    create.mutate(payload, {
      onSuccess: (detail) => {
        setCreatedId(detail.id);
        toast.success('Event draft created.');
        setStep(6);
      },
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.message : 'Could not create the event.'),
    });
  };

  const onPublish = (): void => {
    publish.mutate(undefined, {
      onSuccess: (detail) => {
        toast.success('Event published.');
        router.push(`/events/${detail.slug}`);
      },
      onError: (e) =>
        toast.error(
          e instanceof ApiError ? e.message : 'Publishing failed — complete all required fields.',
        ),
    });
  };

  const toggleProblem = (id: string): void => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id].slice(0, 100),
    );
  };

  return (
    <Card>
      <CardContent className="space-y-6 p-4 sm:p-6">
        {/* Scrollable stepper: 7 steps never fit a 360px row; the current
            position stays readable via the label below. */}
        <ol className="flex flex-nowrap gap-3 overflow-x-auto whitespace-nowrap pb-1 text-sm">
          {STEPS.map((label, index) => (
            <li
              key={label}
              aria-current={index === step ? 'step' : undefined}
              className={
                index === step ? 'shrink-0 font-semibold text-primary' : 'shrink-0 text-muted-foreground'
              }
            >
              {index + 1}. {label}
              {index < STEPS.length - 1 ? ' ›' : ''}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
        {step === 0 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ev-title">Title</Label>
              <Input
                id="ev-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Monsoon Aptitude Marathon"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-desc">Description (min 20 chars)</Label>
              <Textarea
                id="ev-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="What is this event about, who should join, what will they solve?"
              />
            </div>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Event type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['CONTEST', 'QUIZ', 'WORKSHOP', 'MARATHON', 'MEETUP', 'AMA', 'HACKATHON'].map(
                    (t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['EASY', 'MEDIUM', 'HARD'].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['PUBLIC', 'PRIVATE', 'UNIVERSITY'].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Private events need invites or an entry code; university events need an
                organization.
              </p>
            </div>
            {visibility === 'PRIVATE' ? (
              <div className="space-y-2">
                <Label htmlFor="ev-code">Entry code (optional, 4–32 characters)</Label>
                <Input
                  id="ev-code"
                  value={entryCode}
                  onChange={(e) => setEntryCode(e.target.value)}
                  placeholder="friends-only-2026"
                  maxLength={32}
                />
                <p className="text-sm text-muted-foreground">
                  Anyone with this code can register — no invite needed. Leave empty for
                  invite-only.
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Organization (university events)</Label>
              <Input
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                placeholder="Search 170+ universities…"
                aria-label="Search universities"
              />
              <Select value={organizationId} onValueChange={setOrganizationId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      orgs ? `Select… (${orgs.items.length} listed)` : 'Loading universities…'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(orgs?.items ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {orgsError ? (
                <button
                  type="button"
                  className="text-xs text-destructive underline-offset-2 hover:underline"
                  onClick={() => void refetchOrgs()}
                >
                  Couldn&apos;t load universities — retry, or add yours below
                </button>
              ) : null}
              <div className="flex gap-2">
                <Input
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Missing? Type college name…"
                  aria-label="New university name"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={createOrg.isPending}
                  onClick={onAddOrg}
                >
                  {createOrg.isPending ? 'Adding…' : 'Add'}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-cap">Max participants (optional)</Label>
              <Input
                id="ev-cap"
                inputMode="numeric"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="500"
              />
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Select from approved published questions only — events never duplicate content (
                {selected.length} selected).
              </p>
              <Button type="button" variant="outline" onClick={() => setCreatingProblem(true)}>
                New problem
              </Button>
            </div>
            <NewProblemDialog
              open={creatingProblem}
              onOpenChange={setCreatingProblem}
              onCreated={createAndSelect}
            />
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {freshProblems.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => toggleProblem(p.id)}
                    />
                    <span className="flex-1">{p.title}</span>
                    <span className="text-muted-foreground">New</span>
                  </label>
                </li>
              ))}
              {problemItems.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => toggleProblem(p.id)}
                    />
                    <span className="flex-1">{p.title}</span>
                    <span className="text-muted-foreground">{p.difficulty}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {step === 4 ? (
          <div className="space-y-2">
            <Label htmlFor="ev-rules">Rules</Label>
            <Textarea
              id="ev-rules"
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              rows={6}
              placeholder="Scoring, timing, conduct, tie-breaks (score → correct → time)…"
            />
          </div>
        ) : null}
        {step === 5 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ev-start">Start</Label>
              <Input
                id="ev-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-end">End</Label>
              <Input
                id="ev-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-reg">Registration closes (optional)</Label>
              <Input
                id="ev-reg"
                type="datetime-local"
                value={regEnd}
                onChange={(e) => setRegEnd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-dur">Duration (minutes)</Label>
              <Input
                id="ev-dur"
                inputMode="numeric"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
          </div>
        ) : null}
        {step === 6 ? (
          <div className="space-y-3 text-sm">
            <h2 className="text-section-title">Review & publish</h2>
            <p>
              <strong>{payload.title}</strong> — {payload.eventType} · {payload.visibility} ·{' '}
              {payload.difficulty}
            </p>
            <p className="text-muted-foreground">
              {selected.length} questions · {payload.durationMinutes} min ·{' '}
              {payload.maxParticipants ? `${payload.maxParticipants} seats` : 'open capacity'}
            </p>
            {!createdId ? (
              <p className="text-muted-foreground">
                Create the draft first, then publish. Publishing validates completeness server-side.
              </p>
            ) : (
              <p className="text-muted-foreground">Draft saved. Publish to open registration.</p>
            )}
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          {step < 5 ? (
            <Button disabled={!canNext} onClick={() => setStep((s) => Math.min(6, s + 1))}>
              Continue
            </Button>
          ) : step === 5 ? (
            <Button disabled={!canNext || create.isPending} onClick={onCreate}>
              {create.isPending ? 'Creating…' : 'Create draft'}
            </Button>
          ) : !createdId ? (
            <Button disabled={create.isPending} onClick={onCreate}>
              {create.isPending ? 'Creating…' : 'Create draft'}
            </Button>
          ) : (
            <Button disabled={publish.isPending} onClick={onPublish}>
              {publish.isPending ? 'Publishing…' : 'Publish event'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
