'use client';

import { ArrowLeft, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/layout/page-container';
import { RequireAuth } from '@/components/auth/require-auth';
import {
  ContestFormatForm,
  defaultValues,
  manageToValues,
  toCreateInput,
  toPatchInput,
} from '@/components/contests/contest-format-form';
import { ContestQuestionsStep } from '@/components/contests/contest-questions-step';
import { Button, EmptyState, LoadingState } from '@apteez/ui';
import { useAdminAccess } from '@/hooks/use-admin';
import { authErrorMessage, useAuth } from '@/hooks/use-auth';
import { useContestManage, useCreateContest, useUpdateContestDraft } from '@/hooks/use-contests';

/**
 * Admin contest-creation wizard: step 1 captures the format (question count +
 * length first), then hands off to the manage page for questions, one by one,
 * then publish. The handoff is a real route (`/contests/[id]/manage`), so a
 * refresh or coming back later resumes exactly where the draft left off —
 * nothing lives in throwaway component state.
 */
export function ContestWizard(): React.JSX.Element {
  return (
    <PageStack>
      <PageHeader
        title="New contest"
        description="Format first — how many questions, how long — then add the questions one by one."
      />
      <RequireAuth>
        <WizardBody />
      </RequireAuth>
    </PageStack>
  );
}

function WizardBody(): React.JSX.Element {
  const { user, isLoading: authLoading } = useAuth();
  const access = useAdminAccess(['manage:contests']);
  const router = useRouter();
  const create = useCreateContest();

  if (authLoading) {
    return <LoadingState title="Checking access…" />;
  }
  if (!user) {
    return (
      <EmptyState title="Sign in required" description="Sign in as an admin to create contests." />
    );
  }
  if (!access.allowed) {
    return (
      <EmptyState
        title="Admin access required"
        description="Only admins can create contests. Ask an admin to grant it."
      />
    );
  }

  // Step 1: format. Step 2 lives on the manage page (URL-persisted draft).
  return (
    <ContestFormatForm
      initial={defaultValues()}
      submitLabel="Create draft & add questions"
      pending={create.isPending}
      error={create.isError ? authErrorMessage(create.error, 'Could not create.') : null}
      onSubmit={(values) =>
        void create
          .mutateAsync(toCreateInput(values))
          .then((manage) => router.push(`/contests/${manage.id}/manage`))
      }
    />
  );
}

export function ContestManagePage({ contestId }: { contestId: string }): React.JSX.Element {
  return (
    <PageStack>
      <PageHeader title="Manage contest" description="Questions, schedule, and publishing." />
      <RequireAuth>
        <ManageBody contestId={contestId} />
      </RequireAuth>
    </PageStack>
  );
}

function ManageBody({ contestId }: { contestId: string }): React.JSX.Element {
  const { user, isLoading: authLoading } = useAuth();
  const access = useAdminAccess(['manage:contests']);
  const [editing, setEditing] = React.useState(false);
  const manage = useContestManage(access.allowed ? contestId : undefined);
  const update = useUpdateContestDraft(contestId);

  if (authLoading || (access.allowed && manage.isPending)) {
    return <LoadingState title="Loading contest…" />;
  }
  if (!user) {
    return <EmptyState title="Sign in required" description="Sign in to manage contests." />;
  }
  if (!access.allowed) {
    return (
      <EmptyState title="Admin access required" description="Only admins can manage contests." />
    );
  }
  if (manage.isError || !manage.data) {
    return (
      <EmptyState
        title="Contest not found"
        description="It may belong to another admin, or the id is wrong."
        action={
          <Button asChild>
            <Link href="/contests/new">Create a contest</Link>
          </Button>
        }
      />
    );
  }

  const showEdit = editing && manage.data.status === 'DRAFT';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {manage.data.status !== 'DRAFT' ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/contests/${contestId}`}>
              <ArrowLeft aria-hidden />
              View contest
            </Link>
          </Button>
        ) : null}
        {manage.data.status === 'DRAFT' ? (
          <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            <Pencil aria-hidden />
            {showEdit ? 'Back to questions' : 'Edit format'}
          </Button>
        ) : null}
      </div>
      {showEdit ? (
        <ContestFormatForm
          key={manage.data.id}
          initial={manageToValues(manage.data)}
          submitLabel="Save format"
          pending={update.isPending}
          error={update.isError ? authErrorMessage(update.error, 'Could not save.') : null}
          onSubmit={(values) =>
            void update.mutateAsync(toPatchInput(values)).then(() => setEditing(false))
          }
        />
      ) : (
        <ContestQuestionsStep contestId={contestId} />
      )}
    </div>
  );
}
