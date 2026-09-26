import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimilarProblems } from '../similar-problems';

const similarMock = vi.hoisted(() => ({
  data: undefined as
    | {
        items: Array<{
          problem: { id: string; title: string };
          score: number;
          source: 'vector' | 'lexical-fallback';
        }>;
      }
    | undefined,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
}));

vi.mock('@/hooks/use-search', () => ({
  useSimilarProblems: () => similarMock,
}));

function problem(id: string, title: string) {
  return {
    id,
    title,
    contentMode: 'TEXT_ONLY',
    difficulty: 'MEDIUM',
    rating: 1500,
    category: { slug: 'quantitative', name: 'Quantitative' },
    topic: { slug: 'time-and-work', name: 'Time and Work' },
    subtopic: null,
    examTags: [],
    optionCount: 4,
    hasImage: false,
    hasExplanation: true,
    hasShortcut: false,
    publishedAt: null,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  similarMock.data = undefined;
  similarMock.isLoading = false;
  similarMock.isError = false;
  similarMock.error = undefined;
});

describe('SimilarProblems', () => {
  it('shows a loading state while retrieving', () => {
    similarMock.isLoading = true;
    render(<SimilarProblems problemId="p1" />);
    expect(screen.getByLabelText(/loading similar problems/i)).toBeDefined();
  });

  it('shows an honest empty state instead of fabricated questions', () => {
    similarMock.data = { items: [] };
    render(<SimilarProblems problemId="p1" />);
    expect(screen.getByText(/no close matches/i)).toBeDefined();
  });

  it('shows an error with retry and no fake content', () => {
    similarMock.isError = true;
    similarMock.error = new Error('vector store down');
    render(<SimilarProblems problemId="p1" />);
    expect(screen.getByRole('alert')).toBeDefined();
    fireEvent.click(screen.getByText(/retry/i));
    expect(similarMock.refetch).toHaveBeenCalled();
  });

  it('renders only real library problems as links', () => {
    similarMock.data = {
      items: [
        { problem: problem('p2', 'Work and time'), score: 0.9, source: 'vector' },
        { problem: problem('p3', 'Pipes sums'), score: 0.8, source: 'lexical-fallback' },
      ],
    };
    render(<SimilarProblems problemId="p1" />);
    expect(screen.getByText('Work and time')).toBeDefined();
    expect(screen.getByText('Pipes sums')).toBeDefined();
  });
});
