import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserMenu } from '../user-menu';

const authMock = vi.hoisted(() => ({
  user: null as null | { displayName: string; email: string },
  isLoading: false,
  logout: vi.fn(),
  isLoggingOut: false,
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: authMock.user, isLoading: authMock.isLoading }),
  useLogout: () => ({ logout: authMock.logout, isLoggingOut: authMock.isLoggingOut }),
}));

vi.mock('@apteez/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const ReactImpl = await import('react');
  const Passthrough = ({ children }: { children?: ReactNode }) =>
    ReactImpl.createElement(ReactImpl.Fragment, null, children);
  const Item = ({
    children,
    asChild,
    onClick,
  }: {
    children?: ReactNode;
    asChild?: boolean;
    onClick?: () => void;
  }) =>
    asChild
      ? ReactImpl.createElement(ReactImpl.Fragment, null, children)
      : ReactImpl.createElement('button', { type: 'button', onClick }, children);
  return {
    ...actual,
    DropdownMenu: Passthrough,
    DropdownMenuTrigger: Passthrough,
    DropdownMenuContent: Passthrough,
    DropdownMenuLabel: Passthrough,
    DropdownMenuSeparator: () => ReactImpl.createElement('hr'),
    DropdownMenuItem: Item,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UserMenu', () => {
  it('shows a loading skeleton without layout shift', () => {
    authMock.user = null;
    authMock.isLoading = true;
    render(<UserMenu />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows sign-in actions for guests', () => {
    authMock.user = null;
    authMock.isLoading = false;
    render(<UserMenu />);
    expect(screen.getByText('Sign in')).toBeDefined();
    expect(screen.getByText('Create account')).toBeDefined();
  });

  it('shows the real user and invokes logout when signed in', () => {
    authMock.user = { displayName: 'Ada Lovelace', email: 'ada@apteez.dev' };
    authMock.isLoading = false;
    render(<UserMenu />);
    expect(screen.getByText('Ada Lovelace')).toBeDefined();
    expect(screen.getByText('ada@apteez.dev')).toBeDefined();
    fireEvent.click(screen.getByText('Sign out'));
    expect(authMock.logout).toHaveBeenCalledTimes(1);
  });
});
