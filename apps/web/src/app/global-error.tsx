'use client';

import { TriangleAlert } from 'lucide-react';
import { Button } from '@apteez/ui';

/** Last-resort boundary when even the root layout fails to render. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            minHeight: '100vh',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
            padding: 24,
          }}
        >
          <TriangleAlert size={28} aria-hidden />
          <p style={{ fontWeight: 600 }}>ApteeZ failed to start this view.</p>
          <Button onClick={reset}>Try again</Button>
        </div>
      </body>
    </html>
  );
}
