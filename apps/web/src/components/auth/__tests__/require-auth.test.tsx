import { cleanup, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/hooks/use-auth';
import { RequireAuth } from '../require-auth';

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, refresh: vi.fn() }),
  usePathname: () => '/profile',
}));

const replaceMock = mocks.replace;
const mockedUseAuth = vi.mocked(useAuth);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RequireAuth', () => {
  it('renders a loading state while auth resolves', () => {
    mockedUseAuth.mockReturnValue({ user: null, isLoading: true, isAuthenticated: false } as never);
    render(
      <RequireAuth>
        <p>Secret</p>
      </RequireAuth>,
    );
    expect(screen.queryByText('Secret')).toBeNull();
  });

  it('redirects guests to login with a return path', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    } as never);
    render(
      <RequireAuth>
        <p>Secret</p>
      </RequireAuth>,
    );
    expect(replaceMock).toHaveBeenCalledWith('/login?next=%2Fprofile');
    expect(screen.queryByText('Secret')).toBeNull();
  });

  it('renders children for authenticated users', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'a@b.com' },
      isLoading: false,
      isAuthenticated: true,
    } as never);
    render(
      <RequireAuth>
        <p>Secret</p>
      </RequireAuth>,
    );
    expect(screen.getByText('Secret')).toBeDefined();
  });
});
