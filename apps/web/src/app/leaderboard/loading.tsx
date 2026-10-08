import { RouteLoading } from '@/components/shared/route-loading';

export default function LeaderboardLoading(): React.JSX.Element {
  return <RouteLoading label="Loading leaderboard" variant="list" rows={8} />;
}
