import { cleanup, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRIMARY_NAV } from '@apteez/config';
import { NavLink } from '../nav-link';

const pathnameMock = vi.hoisted(() => ({ current: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock.current,
}));

afterEach(cleanup);

const challenge = PRIMARY_NAV.find((item) => item.key === 'challenge')!;

describe('NavLink', () => {
  it('marks the active route with aria-current', () => {
    pathnameMock.current = '/challenge';
    render(<NavLink item={challenge} />);
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page');
  });

  it('leaves non-active routes without aria-current', () => {
    pathnameMock.current = '/explore';
    render(<NavLink item={challenge} />);
    expect(screen.getByRole('link')).not.toHaveAttribute('aria-current');
  });

  it('matches nested routes to their parent section', () => {
    pathnameMock.current = '/challenge/session/42';
    render(<NavLink item={challenge} />);
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page');
  });

  it('renders the Coming soon badge for flagged items', () => {
    pathnameMock.current = '/';
    render(
      <NavLink
        item={{
          key: 'targets',
          label: 'Weekly Targets',
          href: '/targets',
          icon: 'target',
          badge: 'soon',
        }}
      />,
    );
    expect(screen.getByText(/coming soon/i)).toBeDefined();
  });
});
