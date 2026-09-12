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
import { ApiError, apiBrowserUrl, apiFetch } from '@/lib/api-client';
import { AUTH_ME_QUERY_KEY, authErrorMessage, sanitizeNextPath, useAuth } from '@/hooks/use-auth';
import { LoadingState } from '@apteez/ui';

function GoogleButton(): React.JSX.Element {
  return (
    <Button variant="outline" className="w-full" asChild>
      <a href={apiBrowserUrl('/auth/google')}>
        <GoogleIcon />
        Continue with Google
      </a>
    </Button>
  );
}

function GoogleIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export function LoginForm(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading } = useAuth();
  const [formError, setFormError] = React.useState<string | null>(null);

  const next = sanitizeNextPath(searchParams.get('next'));

  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(next);
    }
  }, [isLoading, isAuthenticated, router, next]);

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
      router.push(next);
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
          <GoogleButton />
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
