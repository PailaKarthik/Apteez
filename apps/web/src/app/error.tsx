'use client';

import { ErrorState } from '@apteez/ui';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return (
    <ErrorState
      title="This view hit a snag"
      description="Something interrupted this page. Try again — if it keeps happening, share the moment with support."
      onRetry={reset}
    />
  );
}
