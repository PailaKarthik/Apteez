import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import {
  AUTH_ME_QUERY_KEY,
  authErrorMessage,
  sanitizeNextPath,
  useAuth,
  useLogout,
} from '../use-auth';

vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  apiFetch: vi.fn(),
}));

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: vi.fn() }),
}));

const mockedFetch = vi.mocked(apiFetch);

function wrapper(queryClient: QueryClient): React.FC<{ children: React.ReactNode }> {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('sanitizeNextPath', () => {
  it.each([
    ['/profile', '/profile'],
    ['/', '/'],
    ['/contribute?draft=1', '/contribute?draft=1'],
    [null, '/'],
    [undefined, '/'],
    ['', '/'],
    ['https://evil.example', '/'],
    ['//evil.example/x', '/'],
    ['/\\evil', '/'],
    ['javascript:alert(1)', '/'],
  ])('maps %p to %p', (input, expected) => {
    expect(sanitizeNextPath(input)).toBe(expected);
  });
});

describe('authErrorMessage', () => {
  it('maps validation failures to form guidance', () => {
    const error = new ApiError({
      kind: 'validation',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Bad',
    });
    expect(authErrorMessage(error, 'Fallback')).toBe('Check the highlighted fields and try again.');
  });

  it('prefers server messages for auth failures', () => {
    const error = new ApiError({
      kind: 'unauthorized',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Incorrect email or password.',
    });
    expect(authErrorMessage(error, 'Fallback')).toBe('Incorrect email or password.');
  });

  it('falls back for unknown errors', () => {
    expect(authErrorMessage(new Error('boom'), 'Fallback')).toBe('Fallback');
    expect(authErrorMessage(null, 'Fallback')).toBe('Fallback');
  });
});

describe('useAuth', () => {
  it('returns null user when the session is absent', async () => {
    mockedFetch.mockResolvedValueOnce(null);
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper(queryClient) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('useLogout', () => {
  it('calls the endpoint, clears cached data and lands home', async () => {
    mockedFetch.mockResolvedValueOnce({ loggedOut: true });
    const queryClient = new QueryClient();
    queryClient.setQueryData(AUTH_ME_QUERY_KEY, { id: 'user-1' });
    queryClient.setQueryData(['health'], { status: 'ok' });

    const { result } = renderHook(() => useLogout(), { wrapper: wrapper(queryClient) });
    await result.current.logout();

    expect(mockedFetch).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
    expect(queryClient.getQueryData(AUTH_ME_QUERY_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(['health'])).toBeUndefined();
    expect(pushMock).toHaveBeenCalledWith('/');
  });
});
