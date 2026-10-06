import { pageMetadata } from '@/lib/metadata';

/** Section title for every /discussions/* route (detail pages are client-rendered). */
export const metadata = pageMetadata(
  'Discussions',
  'Ask doubts, debate shortcuts and learn from the ApteeZ aptitude community.',
);

export default function DiscussionsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <>{children}</>;
}
