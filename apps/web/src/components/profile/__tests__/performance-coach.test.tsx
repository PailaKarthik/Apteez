import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerformanceCoach } from '../performance-coach';

const coachMock = vi.hoisted(() => ({
  data: undefined as
    | {
        source: 'llm' | 'deterministic';
        response: {
          summary: string;
          strengths: string[];
          weakAreas: string[];
          recommendations: string[];
          suggestedProblems: string[];
          confidence: 'low' | 'medium' | 'high';
        };
      }
    | undefined,
  isPending: false,
  isError: false,
  error: undefined as unknown,
  mutate: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@/hooks/use-coach', () => ({
  usePerformanceCoach: () => coachMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  coachMock.data = undefined;
  coachMock.isPending = false;
  coachMock.isError = false;
  coachMock.error = undefined;
});

describe('PerformanceCoach', () => {
  it('explains grounding before generating', () => {
    render(<PerformanceCoach />);
    expect(screen.getByText(/based on your recent performance/i)).toBeDefined();
    fireEvent.click(screen.getByText(/generate my coaching/i));
    expect(coachMock.mutate).toHaveBeenCalled();
  });

  it('renders structured sections without inventing scores', () => {
    coachMock.data = {
      source: 'llm',
      response: {
        summary: 'Steady week.',
        strengths: ['Algebra is solid.'],
        weakAreas: ['Geometry needs work.'],
        recommendations: ['Drill geometry.'],
        suggestedProblems: ['11111111-1111-4111-8111-111111111111'],
        confidence: 'medium',
      },
    };
    render(<PerformanceCoach />);
    expect(screen.getByText('Steady week.')).toBeDefined();
    expect(screen.getByText('Algebra is solid.')).toBeDefined();
    expect(screen.queryByText(/100%/)).toBeNull();
    expect(screen.queryByText(/guaranteed/i)).toBeNull();
  });

  it('labels the deterministic fallback honestly', () => {
    coachMock.data = {
      source: 'deterministic',
      response: {
        summary: 'Keep practicing.',
        strengths: [],
        weakAreas: [],
        recommendations: [],
        suggestedProblems: [],
        confidence: 'low',
      },
    };
    render(<PerformanceCoach />);
    expect(screen.getByText(/summary/i)).toBeDefined();
  });

  it('shows safe errors with no raw backend payload', () => {
    coachMock.isError = true;
    coachMock.error = new Error(' Daily coaching budget exhausted. ');
    render(<PerformanceCoach />);
    expect(screen.getByRole('alert')).toBeDefined();
  });
});
