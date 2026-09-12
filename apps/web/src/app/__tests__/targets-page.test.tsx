import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import TargetsPage from '../targets/page';

describe('Weekly Targets page', () => {
  it('is clearly marked Coming soon', () => {
    render(<TargetsPage />);
    expect(screen.getByText(/coming soon/i)).toBeDefined();
  });

  it('does not expose target creation controls yet', () => {
    render(<TargetsPage />);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
