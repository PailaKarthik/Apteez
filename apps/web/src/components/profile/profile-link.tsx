'use client';

import Link from 'next/link';
import { cn } from '@apteez/ui';

/**
 * Display name that links to the public profile when a username exists
 * (live-anonymized rows have none and render plain).
 */
export function ProfileName({
  username,
  displayName,
  className,
}: {
  username: string | null;
  displayName: string;
  className?: string;
}): React.JSX.Element {
  if (!username) {
    return <span className={className}>{displayName}</span>;
  }
  return (
    <Link
      href={`/users/${username}`}
      className={cn('underline-offset-2 hover:text-primary hover:underline', className)}
    >
      {displayName}
    </Link>
  );
}
