'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** Theme-aware toast container. Render once inside the app providers. */
function Toaster({ ...props }: ToasterProps): React.JSX.Element {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'rounded-xl border bg-popover text-popover-foreground shadow-lg',
          description: 'text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
