'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  LoadingState,
} from '@apteez/ui';
import { registerSchema, type RegisterInput } from '@apteez/validation';
import { ApiError, apiFetch } from '@/lib/api-client';
import { AUTH_ME_QUERY_KEY, authErrorMessage, useAuth } from '@/hooks/use-auth';
import { GoogleButton } from './google-button';

export function RegisterForm(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading } = useAuth();
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, router]);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', username: '', email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: RegisterInput) =>
      apiFetch<{ user: AuthUser; emailVerification?: { required: boolean; sent: boolean } }>(
        '/auth/register',
        { method: 'POST', body: values },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(AUTH_ME_QUERY_KEY, data.user);
      toast.success(`Welcome to ApteeZ, ${data.user.displayName.split(' ')[0] ?? 'solver'}.`);
      if (data.emailVerification?.sent) {
        toast.success('Verification code sent — check your inbox.');
      }
      router.push('/');
      router.refresh();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.kind === 'validation' && error.details) {
        for (const detail of error.details) {
          if (
            detail.field === 'email' ||
            detail.field === 'username' ||
            detail.field === 'password' ||
            detail.field === 'displayName'
          ) {
            form.setError(detail.field, { message: detail.message });
          }
        }
      }
      setFormError(authErrorMessage(error, 'Registration failed. Try again.'));
    },
  });

  if (isLoading || isAuthenticated) {
    return <LoadingState title="Checking your session…" />;
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6 py-8">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          One account for challenges, contests and contributions.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign up</CardTitle>
          <CardDescription>Pick a username — it will be visible on leaderboards.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <GoogleButton label="Sign up with Google" />
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
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display name</FormLabel>
                      <FormControl>
                        <Input autoComplete="name" placeholder="Ada Lovelace" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input autoComplete="username" placeholder="ada_lovelace" {...field} />
                      </FormControl>
                      <FormDescription>
                        Letters, numbers, dots, hyphens and underscores.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormDescription>At least 12 characters. Longer is stronger.</FormDescription>
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
                  {mutation.isPending ? 'Creating account…' : 'Create account'}
                </Button>
              </form>
            </Form>
          </div>
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
