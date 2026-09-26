import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MySubmissions } from '../my-submissions';

const mocks = vi.hoisted(() => ({
  list: {
    data: undefined as
      | {
          items: Array<{
            id: string;
            title: string;
            status: string;
            feedback: string | null;
            resultingProblemId: string | null;
            submittedAt: string;
          }>;
          total: number;
        }
      | undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  detail: {
    data: undefined as unknown,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock('@/hooks/use-contributions', () => ({
  useMyContributions: () => mocks.list,
  useContributionDetail: () => mocks.detail,
  useSubmitContribution: () => ({ mutate: vi.fn(), isPending: false }),
  useResubmitContribution: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-problems', () => ({
  useCategories: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/use-upload-image', () => ({
  useUploadImage: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.list.data = undefined;
  mocks.list.isPending = false;
  mocks.list.isError = false;
  mocks.list.isFetching = false;
  mocks.detail.data = undefined;
  mocks.detail.isPending = false;
  mocks.detail.isError = false;
});

describe('MySubmissions', () => {
  it('renders statuses, feedback, and the published link', () => {
    mocks.list.data = {
      items: [
        {
          id: 'c1',
          title: 'Time and work',
          status: 'PENDING',
          feedback: 'Show the working for step 2.',
          resultingProblemId: null,
          submittedAt: new Date().toISOString(),
        },
        {
          id: 'c2',
          title: 'Percentages',
          status: 'APPROVED',
          feedback: null,
          resultingProblemId: 'p9',
          submittedAt: new Date().toISOString(),
        },
      ],
      total: 2,
    };
    render(<MySubmissions />);
    expect(screen.getByText('PENDING')).toBeDefined();
    expect(screen.getByText(/Show the working for step 2/)).toBeDefined();
    expect(screen.getByText('APPROVED')).toBeDefined();
    expect(screen.getByRole('link', { name: 'problem' })).toBeDefined();
  });

  it('offers revise for pending items and opens the revision form', async () => {
    mocks.list.data = {
      items: [
        {
          id: 'c1',
          title: 'Time and work',
          status: 'PENDING',
          feedback: null,
          resultingProblemId: null,
          submittedAt: new Date().toISOString(),
        },
      ],
      total: 1,
    };
    mocks.detail.data = {
      id: 'c1',
      title: 'Time and work',
      statement: 'How long…?',
      assets: [],
      options: [{ text: '2h', assetKey: null }],
      correctAnswerIndex: 0,
      explanation: 'Because.',
      difficulty: 'EASY',
      topicName: 'Time and work',
      sourceUrl: null,
      status: 'PENDING',
      feedback: null,
      resultingProblemId: null,
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
    };
    render(<MySubmissions />);
    fireEvent.click(screen.getByRole('button', { name: 'Revise' }));
    expect(await screen.findByText('Revise contribution')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save revision' })).toBeDefined();
  });
});
