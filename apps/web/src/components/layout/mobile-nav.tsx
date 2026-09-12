'use client';

import { Menu } from 'lucide-react';
import * as React from 'react';
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@apteez/ui';
import { SidebarContent } from './sidebar';

/**
 * Mobile navigation drawer. Opens as a focus-trapped sheet; closes on
 * navigation so back/forward keeps working naturally. The trigger is
 * hidden on lg+ where the persistent sidebar takes over.
 */
export function MobileNav(): React.JSX.Element {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation" className="lg:hidden">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 border-r border-border bg-elevated p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
