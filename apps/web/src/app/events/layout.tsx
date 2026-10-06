import { pageMetadata } from '@/lib/metadata';

/** Section title for every /events/* route (detail pages are client-rendered). */
export const metadata = pageMetadata(
  'Events',
  'Live aptitude events on ApteeZ — join rooms, answer together, track results.',
);

export default function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <>{children}</>;
}
