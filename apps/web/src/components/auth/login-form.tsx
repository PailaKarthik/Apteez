'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { AuthUser } from '@apteez/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@apteez/ui';
import { loginSchema, type LoginInput } from '@apteez/validation';
import { ApiError, apiFetch } from '@/lib/api-client';
import { AUTH_ME_QUERY_KEY, authErrorMessage, sanitizeNextPath, useAuth } from '@/hooks/use-auth';
import { isStaffUser } from '@/hooks/use-admin';
import { LoadingState } from '@apteez/ui';
import { GoogleButton } from './google-button';

const OAUTH_ERROR_COPY: Record<string, string> = {
  unavailable: 'Google sign-in is not available right now. Please use email instead.',
  failed: 'Google sign-in did not complete. Please try again or use email.',
};

const OAUTH_REASON_COPY: Record<string, string> = {
  expired: 'Your Google sign-in expired before completing. Please try again.',
  token:
    'Google rejected the sign-in handshake. The redirect URI in Google Cloud Console must exactly match the API callback URL.',
  userinfo: 'Google could not verify this account. Please try again or use email.',
  provision: 'We could not create your session. Please try again or use email.',
};

export function LoginForm(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [formError, setFormError] = React.useState<string | null>(null);

  const next = sanitizeNextPath(searchParams.get('next'));
  // Set by the API when a browser-navigated Google flow fails (see
  // AuthController): shown inline instead of a raw JSON error page.
  // oauthReason is an allowlisted stage code (expired|token|userinfo|provision).
  const oauthError = searchParams.get('oauthError');
  const oauthReason = searchParams.get('oauthReason');
  const oauthMessage =
    (oauthReason ? OAUTH_REASON_COPY[oauthReason] : undefined) ??
    (oauthError ? (OAUTH_ERROR_COPY[oauthError] ?? OAUTH_ERROR_COPY.failed) : null);

  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Staff with no explicit destination land on the admin dashboard.
      router.replace(next === '/' && isStaffUser(user) ? '/admin' : next);
    }
  }, [isLoading, isAuthenticated, router, next, user]);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: LoginInput) =>
      apiFetch<{ user: AuthUser }>('/auth/login', { method: 'POST', body: values }),
    onSuccess: (data) => {
      queryClient.setQueryData(AUTH_ME_QUERY_KEY, data.user);
      toast.success(`Welcome back, ${data.user.displayName.split(' ')[0] ?? 'solver'}.`);
      router.push(next === '/' && isStaffUser(data.user) ? '/admin' : next);
      router.refresh();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.kind === 'validation' && error.details) {
        for (const detail of error.details) {
          if (detail.field === 'email' || detail.field === 'password') {
            form.setError(detail.field, { message: detail.message });
          }
        }
      }
      setFormError(authErrorMessage(error, 'Sign-in failed. Try again.'));
    },
  });

  if (isLoading || isAuthenticated) {
    return <LoadingState title="Checking your session…" />;
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6 py-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue your preparation.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign in</CardTitle>
          <CardDescription>Use your ApteeZ email and password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <GoogleButton next={next} label="Continue with Google" />
          {oauthMessage ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {oauthMessage}
            </p>
          ) : null}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" aria-hidden />
            or with email
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
              className="space-y-4"
              noValidate
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {formError ? (
                <p
                  role="alert"
                  className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {formError}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        New to ApteeZ?{' '}
        <Link
          href="/register"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
