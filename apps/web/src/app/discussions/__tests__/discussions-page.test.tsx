import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DiscussionsPage from '../page';

const state = vi.hoisted(() => ({
  discussions: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: undefined as unknown,
  },
  createThread: { mutate: vi.fn(), isPending: false },
  user: { id: 'u1' } as unknown,
}));

vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: state.user }) }));

vi.mock('@/hooks/use-discussions', () => ({
  useDiscussions: () => state.discussions,
  useCreateThread: () => state.createThread,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children?: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.discussions.data = undefined;
  state.discussions.isLoading = false;
  state.discussions.isError = false;
  state.createThread.isPending = false;
  state.user = { id: 'u1' };
});

function thread(id: string, title: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title,
    excerpt: 'An excerpt',
    tags: ['math'],
    author: {
      id: 'a1',
      username: 'ada',
      displayName: 'Ada',
      avatarKey: null,
      institution: null,
    },
    problemId: null,
    isPinned: false,
    isLocked: false,
    isResolved: false,
    viewCount: 0,
    reactionCount: 0,
    replyCount: 0,
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    myReaction: null,
    ...overrides,
  };
}

describe('DiscussionsPage', () => {
  it('renders the empty state when there are no threads', () => {
    state.discussions.data = {
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    };
    render(<DiscussionsPage />);
    expect(screen.getByText(/No threads yet/i)).toBeDefined();
  });

  it('renders each thread with its counters and tags', () => {
    state.discussions.data = {
      items: [thread('p1', 'How to solve?', { replyCount: 4, reactionCount: 2 })],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    render(<DiscussionsPage />);
    expect(screen.getByText('How to solve?')).toBeDefined();
    expect(screen.getByText('Ada')).toBeDefined();
    expect(screen.getByText('#math')).toBeDefined();
  });

  it('shows the error message when the query fails', () => {
    state.discussions.isError = true;
    state.discussions.error = new Error('boom');
    render(<DiscussionsPage />);
    expect(screen.getByText(/Could not load discussions/i)).toBeDefined();
  });

  it('disables posting until the title and body are long enough', () => {
    state.discussions.data = {
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    };
    render(<DiscussionsPage />);
    fireEvent.click(screen.getByRole('button', { name: /New thread/i }));
    const submit = screen.getByRole('button', { name: /Post thread/i });
    expect(submit.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('Thread title'), {
      target: { value: 'A valid title' },
    });
    fireEvent.change(screen.getByPlaceholderText('Share your question or strategy...'), {
      target: { value: 'A body that is long enough' },
    });
    expect(screen.getByRole('button', { name: /Post thread/i }).hasAttribute('disabled')).toBe(
      false,
    );
  });
});
