import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProblemSummaryDto } from '@apteez/types';
import { ProblemList } from '../problem-list';

afterEach(cleanup);

function problem(id: string, title: string): ProblemSummaryDto {
  return {
    id,
    title,
    contentMode: 'TEXT_ONLY',
    difficulty: 'MEDIUM',
    rating: 1300,
    category: { slug: 'quantitative', name: 'Quantitative Aptitude' },
    topic: { slug: 'time-and-work', name: 'Time and Work' },
    subtopic: null,
    examTags: [],
    optionCount: 4,
    hasImage: false,
    hasExplanation: false,
    hasShortcut: false,
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    accuracy: null,
    solvedCount: 0,
  };
}

const noop = (): void => undefined;

describe('ProblemList states', () => {
  it('renders skeletons while loading', () => {
    const { container } = render(
      <ProblemList
        problems={[]}
        isPending
        isError={false}
        hasNextPage={false}
        isFetchingNextPage={false}
        onRetry={noop}
        onLoadMore={noop}
      />,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders the error state with a retry action', () => {
    const onRetry = vi.fn();
    render(
      <ProblemList
        problems={[]}
        isPending={false}
        isError
        hasNextPage={false}
        isFetchingNextPage={false}
        onRetry={onRetry}
        onLoadMore={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the empty state when filters match nothing', () => {
    render(
      <ProblemList
        problems={[]}
        isPending={false}
        isError={false}
        hasNextPage={false}
        isFetchingNextPage={false}
        onRetry={noop}
        onLoadMore={noop}
      />,
    );
    expect(screen.getByText('No problems match these filters')).toBeDefined();
  });

  it('renders cards and a load-more control when more pages exist', () => {
    const onLoadMore = vi.fn();
    render(
      <ProblemList
        problems={[problem('a-1', 'Problem one'), problem('a-2', 'Problem two')]}
        isPending={false}
        isError={false}
        hasNextPage
        isFetchingNextPage={false}
        onRetry={noop}
        onLoadMore={onLoadMore}
      />,
    );
    expect(screen.getByText('Problem one')).toBeDefined();
    expect(screen.getByText('Problem two')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Load more problems' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows the end-of-results note when the last page is loaded', () => {
    render(
      <ProblemList
        problems={[problem('a-1', 'Problem one')]}
        isPending={false}
        isError={false}
        hasNextPage={false}
        isFetchingNextPage={false}
        onRetry={noop}
        onLoadMore={noop}
      />,
    );
    expect(screen.getByText(/End of results/)).toBeDefined();
  });
});
