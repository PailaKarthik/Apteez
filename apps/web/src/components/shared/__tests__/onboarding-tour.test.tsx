import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingTour } from '../onboarding-tour';

const authMock = vi.hoisted(() => ({
  user: null as null | { displayName: string },
  isLoading: false,
}));

const pushMock = vi.fn();

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: authMock.user, isLoading: authMock.isLoading }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

const KEY = 'apteez:onboarding-v2';

function signIn(): void {
  authMock.user = { displayName: 'Ada' };
  authMock.isLoading = false;
}

function openTour(): void {
  render(<OnboardingTour />);
  act(() => {
    vi.runAllTimers();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  authMock.user = null;
  authMock.isLoading = false;
});

describe('OnboardingTour', () => {
  it('stays hidden for guests', () => {
    render(<OnboardingTour />);
    act(() => {
      vi.runAllTimers();
    });
    expect(screen.queryByText('Welcome to ApteeZ')).toBeNull();
  });

  it('stays hidden when the tour was already seen', () => {
    signIn();
    window.localStorage.setItem(KEY, '1');
    openTour();
    expect(screen.queryByText('Welcome to ApteeZ')).toBeNull();
  });

  it('walks a fresh user through the spotlight steps and finishes', () => {
    signIn();
    openTour();

    expect(screen.getByText('Welcome to ApteeZ')).toBeDefined();
    expect(screen.getByText(/quick tour/i)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText('Duel live opponents')).toBeDefined();
    expect(screen.getByText(/tab · challenge/i)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByText('Welcome to ApteeZ')).toBeDefined();

    // Walk through the remaining steps to the end.
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    }
    expect(screen.getByText('Streaks turn into rewards')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /start practicing/i }));
    expect(pushMock).toHaveBeenCalledWith('/challenge');
    expect(window.localStorage.getItem(KEY)).toBe('1');
    expect(screen.queryByText('Streaks turn into rewards')).toBeNull();
  });

  it('skip remembers the choice without navigating', () => {
    signIn();
    openTour();
    expect(screen.getByText('Welcome to ApteeZ')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /skip tour/i }));
    expect(window.localStorage.getItem(KEY)).toBe('1');
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Welcome to ApteeZ')).toBeNull();
  });
});
