import { pageMetadata } from '@/lib/metadata';

/** Search is a client page, so the section title lives here. */
export const metadata = pageMetadata(
  'Search',
  'Search ApteeZ problems, lessons, contests and discussions in one place.',
);

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <>{children}</>;
}
