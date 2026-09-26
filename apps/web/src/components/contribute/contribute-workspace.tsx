'use client';

import { FileText, Inbox, PenLine } from 'lucide-react';
import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@apteez/ui';
import { ContributionForm, DraftsList } from './contribution-form';
import { MySubmissions } from './my-submissions';

/**
 * Contribute workspace: compose new questions, track server-side submissions
 * through review, and keep offline drafts on this device.
 */
export function ContributeWorkspace(): React.JSX.Element {
  const [refreshSignal, setRefreshSignal] = React.useState(0);

  return (
    <Tabs defaultValue="compose" className="w-full">
      <TabsList className="w-full justify-start sm:w-auto">
        <TabsTrigger value="compose">
          <PenLine aria-hidden />
          New contribution
        </TabsTrigger>
        <TabsTrigger value="submissions">
          <Inbox aria-hidden />
          My submissions
        </TabsTrigger>
        <TabsTrigger value="drafts">
          <FileText aria-hidden />
          Device drafts
        </TabsTrigger>
      </TabsList>
      <TabsContent value="compose">
        <ContributionForm onSaved={() => setRefreshSignal((value) => value + 1)} />
      </TabsContent>
      <TabsContent value="submissions">
        <div className="space-y-3">
          <div>
            <h2 className="text-card-title text-foreground">My submissions</h2>
            <p className="text-sm text-muted-foreground">
              Everything you sent for review, with live statuses and reviewer feedback.
            </p>
          </div>
          <MySubmissions />
        </div>
      </TabsContent>
      <TabsContent value="drafts">
        <div className="space-y-2">
          <h2 className="text-card-title text-foreground">Drafts on this device</h2>
          <p className="text-sm text-muted-foreground">
            Offline copies only — submitting (above) is what sends a question to review.
          </p>
          <DraftsList refreshSignal={refreshSignal} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
