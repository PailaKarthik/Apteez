import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailVerificationBanner } from '../email-verification-banner';

const state = vi.hoisted(() => ({
  user: undefined as { email: string; emailVerified: string | null } | undefined,
  requestMutate: vi.fn(),
  requestPending: false,
  verifyMutate: vi.fn(),
  verifyPending: false,
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: state.user ?? null }),
}));

vi.mock('@/hooks/use-email', () => ({
  useRequestEmailOtp: () => ({ mutate: state.requestMutate, isPending: state.requestPending }),
  useVerifyEmailOtp: () => ({ mutate: state.verifyMutate, isPending: state.verifyPending }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.user = undefined;
  state.requestPending = false;
  state.verifyPending = false;
});

describe('EmailVerificationBanner', () => {
  it('renders nothing for guests and verified users', () => {
    state.user = undefined;
    const { unmount } = render(<EmailVerificationBanner />);
    expect(document.body.textContent ?? '').not.toContain('Verify your email');
    unmount();
    state.user = { email: 'u@x.com', emailVerified: new Date().toISOString() };
    render(<EmailVerificationBanner />);
    expect(document.body.textContent ?? '').not.toContain('Verify your email');
  });

  it('opens the dialog and submits a 6-digit code', () => {
    state.user = { email: 'u@x.com', emailVerified: null };
    render(<EmailVerificationBanner />);
    fireEvent.click(screen.getByRole('button', { name: /verify email/i }));
    const input = screen.getByLabelText(/6-digit verification code/i);
    fireEvent.change(input, { target: { value: '12ab34cd' } });
    expect((input as HTMLInputElement).value).toBe('1234');
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^verify$/i }));
    expect(state.verifyMutate).toHaveBeenCalledWith('123456', expect.anything());
  });
});
