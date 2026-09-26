'use client';

import { Loader2, MailCheck, Send } from 'lucide-react';
import * as React from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';
import { useRequestEmailOtp, useVerifyEmailOtp } from '@/hooks/use-email';

/**
 * App-wide nudge shown while the signed-in email is unverified. Opens a
 * dialog with send-code + 6-digit verify. Unconfigured mailer surfaces the
 * server's honest 503 instead of a dead form.
 */
export function EmailVerificationBanner(): React.JSX.Element | null {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState('');
  const request = useRequestEmailOtp();
  const verify = useVerifyEmailOtp();

  if (!user || user.emailVerified) {
    return null;
  }

  const submitCode = (): void => {
    if (/^\d{6}$/.test(code.trim())) {
      verify.mutate(code.trim(), {
        onSuccess: () => {
          setOpen(false);
          setCode('');
        },
      });
    }
  };

  return (
    <>
      <div
        role="status"
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm"
      >
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <MailCheck className="size-4 text-warning" aria-hidden />
          Verify your email to secure your account.
        </span>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Verify email
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify your email</DialogTitle>
            <DialogDescription>
              We sent a 6-digit code to {user.email}. It expires in 10 minutes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => void request.mutate()}
                disabled={request.isPending}
              >
                {request.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Send aria-hidden />
                )}
                {request.isSuccess && request.data.sent ? 'Resend code' : 'Send code'}
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    submitCode();
                  }
                }}
                placeholder="6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                aria-label="6-digit verification code"
              />
              <Button onClick={submitCode} disabled={verify.isPending || code.trim().length !== 6}>
                {verify.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Verify
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
