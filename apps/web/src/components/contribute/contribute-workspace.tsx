'use client';

import { ArrowLeft, FileText, Inbox, PenLine, Plus } from 'lucide-react';
import * as React from 'react';
import { Button, Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger } from '@apteez/ui';
import { ContributionForm, DraftsList } from './contribution-form';
import { MySubmissions } from './my-submissions';

/**
 * Contribute workspace: compose new questions, track server-side submissions
 * through review, and keep offline drafts on this device. The composer
 * stays tucked behind a single inviting button until the author asks for
 * it — no wall of form on arrival.
 */
export function ContributeWorkspace(): React.JSX.Element {
  const [refreshSignal, setRefreshSignal] = React.useState(0);
  const [composing, setComposing] = React.useState(false);

  const onSaved = React.useCallback(() => {
    setRefreshSignal((value) => value + 1);
    setComposing(false);
  }, []);

  return (
    <Tabs defaultValue="compose" className="w-full">
      <TabsList className="glass sticky top-top-bar z-10 h-auto w-full justify-start gap-1 py-1.5 shadow-sm sm:w-auto">
        <TabsTrigger value="compose" className="gap-1.5">
          <PenLine aria-hidden />
          New contribution
        </TabsTrigger>
        <TabsTrigger value="submissions" className="gap-1.5">
          <Inbox aria-hidden />
          My submissions
        </TabsTrigger>
        <TabsTrigger value="drafts" className="gap-1.5">
          <FileText aria-hidden />
          Device drafts
        </TabsTrigger>
      </TabsList>
      <TabsContent value="compose" className="animate-fade-in">
        {composing ? (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setComposing(false)}
              className="gap-1.5 text-muted-foreground transition-all hover:gap-2.5 hover:text-foreground"
            >
              <ArrowLeft aria-hidden />
              Back
            </Button>
            <ContributionForm onSaved={onSaved} />
          </div>
        ) : (
          <Card className="animate-scale-in overflow-hidden border-dashed border-primary/30 bg-primary/[0.03]">
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center sm:p-12">
              <span className="icon-tile size-16" aria-hidden>
                <PenLine className="size-7" />
              </span>
              <div className="max-w-md space-y-2">
                <p className="text-lg font-extrabold tracking-tight text-foreground">
                  Author your first question
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Draft an original aptitude question in four guided steps. Submitting sends
                  it to human review — nothing goes live without a reviewer&apos;s eye.
                </p>
              </div>
              <Button
                size="lg"
                onClick={() => setComposing(true)}
                className="btn-sheen shadow-xl shadow-primary/25 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/30"
              >
                <Plus aria-hidden />
                Create a question
              </Button>
            </CardContent>
          </Card>
        )}
      </TabsContent>
      <TabsContent value="submissions" className="animate-fade-in">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="shrink-0 text-card-title text-foreground">My submissions</h2>
            <span className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">
            Everything you sent for review, with live statuses and reviewer feedback.
          </p>
          <MySubmissions />
        </div>
      </TabsContent>
      <TabsContent value="drafts" className="animate-fade-in">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="shrink-0 text-card-title text-foreground">Drafts on this device</h2>
            <span className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground">
            Offline copies only — submitting (above) is what sends a question to review.
          </p>
          <DraftsList refreshSignal={refreshSignal} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
