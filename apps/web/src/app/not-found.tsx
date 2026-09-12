import { Compass } from 'lucide-react';
import Link from 'next/link';
import { Button, EmptyState } from '@apteez/ui';

export default function NotFound(): React.JSX.Element {
  return (
    <div className="py-10">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The route you followed does not exist. Head back home or explore the question library."
        action={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/explore">Explore</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
