'use client';

import { useParams } from 'next/navigation';
import { ContestManagePage } from '@/components/contests/contest-wizard';

export default function ManageContestPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  return <ContestManagePage contestId={params?.id ?? ''} />;
}
