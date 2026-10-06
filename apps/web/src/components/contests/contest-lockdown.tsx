'use client';

import { Expand, Loader2, ShieldAlert, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button, Card, CardContent } from '@apteez/ui';
import { useReportContestEvent } from '@/hooks/use-contests';

type GateState = 'gate' | 'active' | 'bypassed';

/**
 * Exam lockdown for live contests. The server clock stays authoritative —
 * this only raises the cheating cost and records integrity telemetry
 * (the existing suspicious-events endpoint, throttled server-side):
 *
 * - Fullscreen gate before the paper opens; exiting mid-contest raises a
 *   blocking overlay (the timer keeps running — stated explicitly).
 * - Copy / cut / paste / context-menu blocked inside the paper.
 * - Tab-hide, window-blur and fullscreen transitions reported.
 * - Identity watermark over the paper deters screenshots (a screenshot
 *   cannot be blocked by any website — the watermark makes leaks traceable).
 */
export function ContestLockdown({
  contestId,
  contestName,
  participantLabel,
  children,
}: {
  contestId: string;
  contestName: string;
  participantLabel: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const [gate, setGate] = React.useState<GateState>('gate');
  const [exited, setExited] = React.useState(false);
  const [requesting, setRequesting] = React.useState(false);
  const report = useReportContestEvent(contestId);

  const send = React.useCallback(
    (type: string, detail?: string): void => {
      report.mutate({ type, detail }, { onError: () => undefined });
    },
    [report],
  );
  const sendRef = React.useRef(send);
  sendRef.current = send;

  const unsupported = typeof document !== 'undefined' && document.fullscreenEnabled === false;

  const enterFullscreen = React.useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined') {
      return false;
    }
    if (document.fullscreenElement) {
      return true;
    }
    try {
      await document.documentElement.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }, []);

  const start = async (): Promise<void> => {
    setRequesting(true);
    try {
      const ok = await enterFullscreen();
      if (ok) {
        send('FULLSCREEN_ENTER');
        setGate('active');
      } else {
        toast.error('Fullscreen was blocked by the browser — you can continue without it.');
        send('FULLSCREEN_EXIT', 'entry blocked by browser; continued without fullscreen');
        setGate('bypassed');
      }
    } finally {
      setRequesting(false);
    }
  };

  const bypass = (): void => {
    send('FULLSCREEN_EXIT', 'participant bypassed the fullscreen gate');
    setGate('bypassed');
  };

  // While enforced, leaving fullscreen raises the overlay (once per exit).
  React.useEffect(() => {
    if (gate !== 'active') {
      return undefined;
    }
    const onChange = (): void => {
      if (!document.fullscreenElement) {
        setExited(true);
        sendRef.current('FULLSCREEN_EXIT', 'left fullscreen mid-contest');
      } else {
        setExited(false);
        sendRef.current('FULLSCREEN_ENTER', 're-entered fullscreen');
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [gate]);

  // Tab / window telemetry (reported, never blocking).
  React.useEffect(() => {
    if (gate === 'gate') {
      return undefined;
    }
    const onVisibility = (): void => {
      sendRef.current(document.hidden ? 'TAB_HIDDEN' : 'TAB_VISIBLE');
    };
    const onBlur = (): void => sendRef.current('WINDOW_BLUR');
    const onFocus = (): void => sendRef.current('WINDOW_FOCUS');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [gate]);

  const blockCopy =
    (kind: 'COPY' | 'PASTE') =>
    (event: React.ClipboardEvent): void => {
      event.preventDefault();
      send(kind, `blocked ${kind.toLowerCase()} inside the paper`);
      toast.warning(`${kind === 'COPY' ? 'Copying' : 'Pasting'} is disabled during the contest.`);
    };
  const blockCut = (event: React.ClipboardEvent): void => {
    event.preventDefault();
  };

  if (gate === 'gate') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-warning/15 text-warning">
            <ShieldAlert className="size-7" aria-hidden />
          </span>
          <div>
            <h2 className="text-page-title text-foreground">Secure mode for {contestName}</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              This contest runs locked down: fullscreen, no copying, and tab switches are reported
              to the admin team. Your timer runs on the server — leaving this page never pauses it.
            </p>
          </div>
          {unsupported ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning"
            >
              <TriangleAlert className="size-3.5" aria-hidden />
              Your browser does not support fullscreen — you can continue without it; that choice is
              reported.
            </p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void start()} disabled={requesting}>
              {requesting ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Expand aria-hidden />
              )}
              Enter fullscreen & start
            </Button>
            <Button variant="outline" onClick={bypass}>
              Continue without fullscreen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className="relative select-none"
      onCopy={blockCopy('COPY')}
      onCut={blockCut}
      onPaste={blockCopy('PASTE')}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* Identity watermark: screenshots stay possible, leaks stay traceable.
          Scoped absolute (not fixed): it covers the runner content without
          floating above the sticky topbar and mobile tab bar. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-[0.05]"
      >
        <div className="absolute inset-[-50%] grid grid-cols-3 content-center gap-16 rotate-[-18deg]">
          {Array.from({ length: 24 }).map((_, index) => (
            <p key={index} className="whitespace-nowrap text-lg font-bold text-foreground">
              {participantLabel} · {contestName}
            </p>
          ))}
        </div>
      </div>

      {children}

      {exited && gate === 'active' ? (
        <div
          role="alertdialog"
          aria-label="Fullscreen exited"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/90 p-4 backdrop-blur-sm"
        >
          <Card className="max-h-[90dvh] w-full max-w-md overflow-y-auto">
            <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:p-8">
              <span className="flex size-14 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <TriangleAlert className="size-7" aria-hidden />
              </span>
              <div>
                <h2 className="text-page-title text-foreground">You left fullscreen</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This exit was reported to the admin team. Your timer is still running — re-enter
                  fullscreen to continue.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  onClick={() =>
                    void (async () => {
                      const ok = await enterFullscreen();
                      if (ok) {
                        setExited(false);
                      } else {
                        toast.error('Fullscreen was blocked — continuing without it.');
                        setGate('bypassed');
                      }
                    })()
                  }
                >
                  <Expand aria-hidden />
                  Re-enter fullscreen
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    send('FULLSCREEN_EXIT', 'acknowledged exit; continued without fullscreen');
                    setGate('bypassed');
                    setExited(false);
                  }}
                >
                  Continue without it
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
