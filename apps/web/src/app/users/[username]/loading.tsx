import { RouteLoading } from '@/components/shared/route-loading';

export default function UserLoading(): React.JSX.Element {
  return <RouteLoading label="Loading member profile" rows={6} />;
}
