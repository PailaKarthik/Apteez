'use client';

import { FileText, PenLine } from 'lucide-react';
import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@apteez/ui';
import { ContributionForm, DraftsList } from './contribution-form';

/**
 * Contribute workspace. Tabs split composing from reviewing local drafts so
 * the future review pipeline (pending → under review → approved/rejected)
 * can slot into the second tab without restructuring this page.
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
        <TabsTrigger value="drafts">
          <FileText aria-hidden />
          My drafts
        </TabsTrigger>
      </TabsList>
      <TabsContent value="compose">
        <ContributionForm onSaved={() => setRefreshSignal((value) => value + 1)} />
      </TabsContent>
      <TabsContent value="drafts">
        <div className="space-y-2">
          <h2 className="text-card-title text-foreground">Drafts on this device</h2>
          <p className="text-sm text-muted-foreground">
            Submitted contributions will appear here with their review status once the submission
            workflow ships.
          </p>
          <DraftsList refreshSignal={refreshSignal} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
