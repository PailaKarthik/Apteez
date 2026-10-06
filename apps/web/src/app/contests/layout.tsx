import { pageMetadata } from '@/lib/metadata';

/** Section title for every /contests/* route (detail pages are client-rendered). */
export const metadata = pageMetadata(
  'Contests',
  'Timed aptitude contests on ApteeZ — register, compete live, and compare ranks and ratings.',
);

export default function ContestsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <>{children}</>;
}
