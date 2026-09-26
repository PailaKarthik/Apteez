'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AuthUser } from '@apteez/types';
import { ApiError, apiFetch } from '@/lib/api-client';
import { AUTH_ME_QUERY_KEY } from './use-auth';

export interface EmailOtpStatus {
  sent: boolean;
  verified: boolean;
}

/** Send (or re-send) the 6-digit verification code to the caller's email. */
export function useRequestEmailOtp() {
  return useMutation({
    mutationFn: () => apiFetch<EmailOtpStatus>('/auth/email/verify-request', { method: 'POST' }),
    onSuccess: (data) => {
      if (data.verified) {
        toast.success('Your email is already verified.');
      } else if (data.sent) {
        toast.success('Verification code sent — check your inbox.');
      }
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not send the code. Try again.',
      );
    },
  });
}

/** Verify the 6-digit code; flips the auth profile to verified on success. */
export function useVerifyEmailOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<AuthUser>('/auth/email/verify', { method: 'POST', body: { code } }),
    onSuccess: (user) => {
      queryClient.setQueryData<AuthUser | null>(AUTH_ME_QUERY_KEY, user);
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success('Email verified. Welcome aboard.');
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof ApiError ? error.message : 'Verification failed. Try again.',
      );
    },
  });
}
