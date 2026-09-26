import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { GlobalSearch } from '../global-search';

vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  apiFetch: vi.fn(),
}));

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

const mockedFetch = vi.mocked(apiFetch);

function renderSearch(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GlobalSearch />
    </QueryClientProvider>,
  );
}

const suggestions = {
  problems: [{ id: 'p1', title: 'Time and Work Basics' }],
  topics: [{ slug: 'time-work', name: 'Time and Work' }],
  contests: [],
  events: [],
  discussions: [],
};

describe('GlobalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetch.mockResolvedValue(suggestions);
  });

  afterEach(() => {
    cleanup();
  });

  it('debounces suggestion requests and groups results with labels', async () => {
    renderSearch();
    const input = screen.getByLabelText(/search problems/i);
    fireEvent.change(input, { target: { value: 'ti' } });
    fireEvent.change(input, { target: { value: 'tim' } });
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Time and Work Basics', undefined, { timeout: 2000 }),
    ).toBeInTheDocument();
    // Rapid keystrokes collapse into a single debounced request.
    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Topic')).toBeInTheDocument();
  });

  it('supports arrow-key navigation, Enter to open, and Escape to close', async () => {
    renderSearch();
    const input = screen.getByLabelText(/search problems/i);
    fireEvent.change(input, { target: { value: 'time' } });
    await screen.findByText('Time and Work Basics', undefined, { timeout: 2000 });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledWith('/explore?topic=time-work');

    // React ignores change events whose value is identical, so type something new.
    fireEvent.change(input, { target: { value: 'times' } });
    await screen.findByText('Time and Work Basics', undefined, { timeout: 2000 });
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('Time and Work Basics')).not.toBeInTheDocument();
    });
  });

  it('submits full search on Enter with no suggestion active', async () => {
    mockedFetch.mockResolvedValue({
      problems: [],
      topics: [],
      contests: [],
      events: [],
      discussions: [],
    });
    renderSearch();
    const input = screen.getByLabelText(/search problems/i);
    fireEvent.change(input, { target: { value: 'xyz-no-match' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledWith('/search?q=xyz-no-match');
  });
});
