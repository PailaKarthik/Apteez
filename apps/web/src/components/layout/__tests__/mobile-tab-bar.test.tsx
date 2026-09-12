import { cleanup, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileTabBar } from '../mobile-tab-bar';

const pathnameMock = vi.hoisted(() => ({ current: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock.current,
}));

afterEach(cleanup);

describe('MobileTabBar', () => {
  it('renders every primary section as a tab', () => {
    pathnameMock.current = '/';
    render(<MobileTabBar />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav.querySelectorAll('a')).toHaveLength(7);
  });

  it('marks the current section active', () => {
    pathnameMock.current = '/leaderboard';
    render(<MobileTabBar />);
    const links = screen.getAllByRole('link');
    const active = links.filter((link) => link.getAttribute('aria-current') === 'page');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent('Leaderboard');
  });
});
