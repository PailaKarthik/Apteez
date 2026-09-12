import * as React from 'react';
import { LoadingState } from '@apteez/ui';
import { pageMetadata } from '@/lib/metadata';
import { LoginForm } from '@/components/auth/login-form';

export const metadata = pageMetadata('Sign in', 'Sign in to your ApteeZ account.');

export default function LoginPage(): React.JSX.Element {
  return (
    <React.Suspense fallback={<LoadingState title="Loading sign in…" />}>
      <LoginForm />
    </React.Suspense>
  );
}
