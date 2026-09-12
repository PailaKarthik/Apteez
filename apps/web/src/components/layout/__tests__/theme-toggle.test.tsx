import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from '../theme-toggle';

const themeMock = vi.hoisted(() => ({
  theme: 'system',
  setTheme: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: themeMock.theme, setTheme: themeMock.setTheme }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ThemeToggle', () => {
  it('exposes light, dark and system as radio options', async () => {
    render(<ThemeToggle />);
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeDefined());
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('marks the persisted choice as checked', async () => {
    themeMock.theme = 'dark';
    render(<ThemeToggle />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /dark theme/i })).toBeDefined());
    expect(screen.getByRole('radio', { name: /dark theme/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('selects a theme on click', async () => {
    render(<ThemeToggle />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /light theme/i })).toBeDefined());
    fireEvent.click(screen.getByRole('radio', { name: /light theme/i }));
    expect(themeMock.setTheme).toHaveBeenCalledWith('light');
  });
});
