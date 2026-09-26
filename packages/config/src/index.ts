import type { ContributionStatus } from '@apteez/types';

/**
 * Framework-agnostic shared configuration. Icons stay in the apps (web maps
 * `icon` keys to Lucide components; mobile will map them to its own set),
 * so this package never depends on React or any UI toolkit.
 */

export const BRAND = {
  name: 'ApteeZ',
  tagline: 'Competitive aptitude, sharpened daily.',
  description:
    'ApteeZ is a competitive aptitude ecosystem for practising, competing and contributing aptitude content.',
} as const;

/** API versioning constants shared by the NestJS app and API clients. */
export const API_PREFIX = 'api';
export const API_VERSION = '1';

export type NavIcon =
  | 'home'
  | 'swords'
  | 'trophy'
  | 'compass'
  | 'crown'
  | 'messages'
  | 'calendar'
  | 'target'
  | 'pen'
  | 'gift';

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: NavIcon;
  /** Visual marker shown next to the label (e.g. "Soon"). */
  badge?: 'soon' | 'new';
}

/** The seven primary competitive areas. Order matches the product shell. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { key: 'home', label: 'Home', href: '/', icon: 'home' },
  { key: 'challenge', label: 'Challenge', href: '/challenge', icon: 'swords' },
  { key: 'contests', label: 'Contests', href: '/contests', icon: 'trophy' },
  { key: 'explore', label: 'Explore', href: '/explore', icon: 'compass' },
  { key: 'leaderboard', label: 'Leaderboard', href: '/leaderboard', icon: 'crown' },
  { key: 'discussions', label: 'Discussions', href: '/discussions', icon: 'messages' },
  { key: 'events', label: 'Events', href: '/events', icon: 'calendar' },
] as const;

/**
 * Personal areas. Weekly Targets is intentionally NOT part of the seven
 * primary sections; it ships as "Coming Soon" until a later prompt
 * implements target setting and points.
 */
export const PERSONAL_NAV: readonly NavItem[] = [
  { key: 'targets', label: 'Weekly Targets', href: '/targets', icon: 'target', badge: 'soon' },
  { key: 'rewards', label: 'Rewards', href: '/rewards', icon: 'gift' },
  { key: 'contribute', label: 'Contribute', href: '/contribute', icon: 'pen' },
] as const;

export type NavKey = (typeof PRIMARY_NAV)[number]['key'] | (typeof PERSONAL_NAV)[number]['key'];

export const FEATURE_FLAGS = {
  weeklyTargets: { enabled: false, status: 'coming-soon' },
  contributions: { enabled: true, status: 'open' },
} as const;

export const CONTRIBUTION_STATUS_INFO: Record<
  ContributionStatus,
  { label: string; description: string }
> = {
  PENDING: {
    label: 'Pending',
    description: 'Received and waiting for a reviewer to pick it up.',
  },
  UNDER_REVIEW: {
    label: 'Under review',
    description: 'A reviewer is checking correctness, clarity and originality.',
  },
  APPROVED: {
    label: 'Approved',
    description: 'Accepted into the question library.',
  },
  REJECTED: {
    label: 'Rejected',
    description: 'Not accepted, with reviewer feedback attached.',
  },
};
