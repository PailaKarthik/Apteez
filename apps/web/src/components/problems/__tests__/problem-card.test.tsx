import { cleanup, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProblemSummaryDto } from '@apteez/types';
import { ProblemCard } from '../problem-card';

afterEach(cleanup);

function makeProblem(overrides: Partial<ProblemSummaryDto> = {}): ProblemSummaryDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Boats and Streams Q23',
    contentMode: 'TEXT_ONLY',
    difficulty: 'EASY',
    rating: 1120,
    category: { slug: 'quantitative', name: 'Quantitative Aptitude' },
    topic: { slug: 'boats-and-streams', name: 'Boats & Streams' },
    subtopic: null,
    examTags: [],
    optionCount: 4,
    hasImage: false,
    hasExplanation: true,
    hasShortcut: false,
    publishedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    accuracy: 72,
    solvedCount: 12,
    ...overrides,
  };
}

describe('ProblemCard', () => {
  it('renders the Figma metadata set', () => {
    render(<ProblemCard problem={makeProblem()} />);
    expect(screen.getByText('Boats and Streams Q23')).toBeDefined();
    expect(screen.getByText(/Quantitative Aptitude/)).toBeDefined();
    expect(screen.getByText('1120')).toBeDefined();
    expect(screen.getByText('72%')).toBeDefined();
    expect(screen.getByText('Easy')).toBeDefined();
  });

  it('links to the problem detail route', () => {
    render(<ProblemCard problem={makeProblem()} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/problems/11111111-1111-4111-8111-111111111111',
    );
  });

  it('marks solved and favorited state with accessible labels', () => {
    render(<ProblemCard problem={makeProblem({ isSolved: true, isFavorited: true })} />);
    expect(screen.getByLabelText('Solved')).toBeDefined();
    expect(screen.getByLabelText('Favorited')).toBeDefined();
  });

  it('omits solved/favorited markers for anonymous callers', () => {
    render(<ProblemCard problem={makeProblem()} />);
    expect(screen.queryByLabelText('Solved')).toBeNull();
    expect(screen.queryByLabelText('Favorited')).toBeNull();
  });

  it('hides the image badge for text-only problems', () => {
    render(<ProblemCard problem={makeProblem()} />);
    expect(screen.queryByLabelText('Has image content')).toBeNull();
  });

  it('shows the image badge when content includes an image', () => {
    render(
      <ProblemCard problem={makeProblem({ hasImage: true, contentMode: 'TEXT_AND_IMAGE' })} />,
    );
    expect(screen.getByLabelText('Has image content')).toBeDefined();
  });

  it('omits accuracy when there is no attempt data', () => {
    render(<ProblemCard problem={makeProblem({ accuracy: null })} />);
    expect(screen.queryByText('72%')).toBeNull();
    expect(screen.getByText('1120')).toBeDefined();
  });
});
