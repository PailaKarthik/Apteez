'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { EventCreateWizard } from '@/components/events/event-create-wizard';
import { RequireAuth } from '@/components/auth/require-auth';
import { Button, EmptyState, LoadingState } from '@apteez/ui';
import { useAdminAccess } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';

export default function CreateEventPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Create event"
        description="Seven steps: basics, type, visibility, questions, rules, schedule, review."
      />
      <RequireAuth>
        <CreateGate />
      </RequireAuth>
    </div>
  );
}

/**
 * Any signed-in user can host: admin-hosted events are flagged official,
 * everything else is a member-hosted event (draft until an admin publishes).
 */
function CreateGate(): React.JSX.Element {
  const { user, isLoading: authLoading } = useAuth();
  const access = useAdminAccess(['manage:events']);

  if (authLoading || access.isLoading) {
    return <LoadingState title="Checking access…" />;
  }
  if (!user) {
    return (
      <EmptyState
        title="Sign in required"
        description="Sign in to host an event."
        action={
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      {!access.allowed ? (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          You are hosting a member event — it stays a draft until an admin publishes it.
        </p>
      ) : null}
      <EventCreateWizard />
    </div>
  );
}
