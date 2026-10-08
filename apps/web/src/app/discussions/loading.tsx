import { RouteLoading } from '@/components/shared/route-loading';

export default function DiscussionsLoading(): React.JSX.Element {
  return <RouteLoading label="Loading discussions" variant="list" rows={7} />;
}
