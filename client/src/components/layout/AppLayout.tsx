import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useUI } from '@/stores/ui';
import { useSocket } from '@/hooks/useSocket';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const { sidebarCollapsed, mobileNavOpen, setMobileNav } = useUI();
  const location = useLocation();
  useSocket();

  // Close the mobile drawer on navigation
  useEffect(() => setMobileNav(false), [location.pathname, setMobileNav]);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 border-r bg-sidebar transition-[width] duration-200 lg:block',
          sidebarCollapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        <Sidebar collapsed={sidebarCollapsed} />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-64 p-0" aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <Sidebar collapsed={false} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <ErrorBoundary inline key={location.pathname}>
            <Suspense
              fallback={
                <div className="flex justify-center py-20">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
