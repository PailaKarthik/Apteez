import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FavoriteButton } from '../favorite-button';

const favMock = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/hooks/use-favorites', () => ({
  useFavoriteToggle: () => ({ mutate: favMock.mutate, isPending: favMock.isPending }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  favMock.isPending = false;
});

describe('FavoriteButton', () => {
  it('labels the unsaved state and exposes aria-pressed', () => {
    render(<FavoriteButton problemId="p1" favorited={false} />);
    const button = screen.getByRole('button', { name: 'Add to favorites' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('labels the saved state', () => {
    render(<FavoriteButton problemId="p1" favorited />);
    const button = screen.getByRole('button', { name: 'Remove from favorites' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles to the opposite of the current server state', () => {
    render(<FavoriteButton problemId="p1" favorited={false} />);
    fireEvent.click(screen.getByRole('button'));
    expect(favMock.mutate).toHaveBeenCalledTimes(1);
    expect(favMock.mutate.mock.calls[0]?.[0]).toEqual({ problemId: 'p1', next: true });
  });

  it('toggles off when already saved', () => {
    render(<FavoriteButton problemId="p1" favorited />);
    fireEvent.click(screen.getByRole('button'));
    expect(favMock.mutate.mock.calls[0]?.[0]).toEqual({ problemId: 'p1', next: false });
  });

  it('disables the control while the mutation is in flight', () => {
    favMock.isPending = true;
    render(<FavoriteButton problemId="p1" favorited={false} />);
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });

  it('renders the labelled variant with state text', () => {
    render(<FavoriteButton problemId="p1" favorited variant="full" />);
    expect(screen.getByText('Saved')).toBeDefined();
  });
});
