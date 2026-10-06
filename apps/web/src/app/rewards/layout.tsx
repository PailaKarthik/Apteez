import { pageMetadata } from '@/lib/metadata';

/** Rewards is a client page, so the section title lives here. */
export const metadata = pageMetadata(
  'Rewards',
  'Earn points for practice and redeem ApteeZ rewards.',
);

export default function RewardsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <>{children}</>;
}
