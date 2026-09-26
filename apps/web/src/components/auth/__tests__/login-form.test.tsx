import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { LoginForm } from '../login-form';

vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  apiFetch: vi.fn(),
}));

const pushMock = vi.fn();

const searchParamsMock = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParamsMock.params,
}));

const mockedFetch = vi.mocked(apiFetch);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  searchParamsMock.params = new URLSearchParams();
});

function renderForm(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LoginForm />
    </QueryClientProvider>,
  );
}

function passwordInput(): HTMLElement {
  const input = document.querySelector('input[type="password"]');
  if (!input) {
    throw new Error('password input not found');
  }
  return input as HTMLElement;
}

describe('LoginForm', () => {
  it('shows client-side validation errors for empty fields', async () => {
    mockedFetch.mockResolvedValueOnce(null);
    renderForm();
    await screen.findByRole('heading', { name: 'Welcome back' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeDefined();
    // Only the initial session check ran — no login attempt was made.
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('shows a safe message when credentials are rejected', async () => {
    mockedFetch.mockResolvedValueOnce(null);
    renderForm();
    await screen.findByRole('heading', { name: 'Welcome back' });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'solver@apteez.dev' },
    });
    fireEvent.change(passwordInput(), { target: { value: 'wrong-password-123' } });
    mockedFetch.mockRejectedValueOnce(
      new ApiError({
        kind: 'unauthorized',
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password.',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Incorrect email or password.');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('stores the user and redirects on success', async () => {
    const signedInUser = {
      id: 'user-1',
      email: 'solver@apteez.dev',
      username: 'solver',
      displayName: 'Solver',
      avatarKey: null,
      country: null,
      institution: null,
      isActive: true,
      roles: ['user'],
      permissions: ['read:questions'],
    };
    mockedFetch.mockResolvedValueOnce(null);
    renderForm();
    await screen.findByRole('heading', { name: 'Welcome back' });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'solver@apteez.dev' },
    });
    fireEvent.change(passwordInput(), { target: { value: 'correct-horse-battery-staple' } });
    mockedFetch.mockResolvedValueOnce({ user: signedInUser });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
  });

  it('forwards the next path into the Google start URL', async () => {
    searchParamsMock.params = new URLSearchParams('next=/contribute');
    mockedFetch.mockResolvedValueOnce(null);
    renderForm();
    await screen.findByRole('heading', { name: 'Welcome back' });
    const link = screen.getByRole('link', { name: /continue with google/i });
    expect(link.getAttribute('href')).toContain('next=%2Fcontribute');
  });

  it('shows an inline message when Google sends the user back with an error', async () => {
    searchParamsMock.params = new URLSearchParams('oauthError=failed');
    mockedFetch.mockResolvedValueOnce(null);
    renderForm();
    await screen.findByRole('heading', { name: 'Welcome back' });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/did not complete/i);
  });
});
