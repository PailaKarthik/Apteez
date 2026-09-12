import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '@apteez/ui';

describe('EmptyState', () => {
  it('renders the title, description and action', () => {
    render(
      <EmptyState
        title="No activity yet"
        description="Start competing to fill this space."
        action={<button type="button">Take action</button>}
      />,
    );
    expect(screen.getByText('No activity yet')).toBeDefined();
    expect(screen.getByText('Start competing to fill this space.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Take action' })).toBeDefined();
  });
});
