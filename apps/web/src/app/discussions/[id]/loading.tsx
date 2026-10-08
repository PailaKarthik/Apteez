import { RouteLoading } from '@/components/shared/route-loading';

export default function DiscussionDetailLoading(): React.JSX.Element {
  return <RouteLoading label="Loading discussion" variant="list" rows={4} />;
}
