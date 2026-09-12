import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { LearningContentBlock } from '@apteez/types';
import { LessonContent } from '../lesson-content';

afterEach(() => {
  cleanup();
});

const blocks: LearningContentBlock[] = [
  { kind: 'heading', value: 'Percentages' },
  { kind: 'text', value: 'A percentage is a fraction of 100.' },
  { kind: 'formula', value: 'x% of y = (x/100) × y' },
  { kind: 'note', value: 'x% of y equals y% of x.' },
  { kind: 'example', value: '15% of 240 is 36.' },
  { kind: 'list', value: 'Conversions', items: ['1/2 = 50%', '1/4 = 25%'] },
  { kind: 'image', url: '/storage/lesson.svg', alt: 'A lesson diagram' },
];

describe('LessonContent', () => {
  it('renders every structured block kind', () => {
    render(<LessonContent blocks={blocks} />);
    expect(screen.getByRole('heading', { name: 'Percentages' })).toBeDefined();
    expect(screen.getByText('A percentage is a fraction of 100.')).toBeDefined();
    expect(screen.getByText('x% of y = (x/100) × y')).toBeDefined();
    expect(screen.getByText('x% of y equals y% of x.')).toBeDefined();
    expect(screen.getByText('15% of 240 is 36.')).toBeDefined();
    expect(screen.getByText('1/2 = 50%')).toBeDefined();
    expect(screen.getByAltText('A lesson diagram')).toBeDefined();
  });

  it('renders an empty-state message for empty content', () => {
    render(<LessonContent blocks={[]} />);
    expect(screen.getByText(/no content yet/)).toBeDefined();
  });

  it('labels the note and example sections semantically', () => {
    render(<LessonContent blocks={blocks} />);
    expect(screen.getByText('Note')).toBeDefined();
    expect(screen.getByText('Example')).toBeDefined();
  });
});
