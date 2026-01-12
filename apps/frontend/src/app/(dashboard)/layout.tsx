'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '@/components/auth-provider';
import { AppSidebar } from '@/components/app-sidebar';
import { SyncStatusHeader } from '@/components/sync-banner';
import { Loader2 } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';

const pageNames: Record<string, string> = {
  '/': 'Dashboard',
  '/sources': 'Sources',
  '/logs': 'Logs',
  '/sessions': 'Sessions',
  '/issues': 'Issues',
  '/settings': 'Settings',
};

function getPageName(pathname: string): string {
  // Exact match first
  if (pageNames[pathname]) return pageNames[pathname];

  // Check if path starts with a known route (for nested routes like /settings/data-management)
  for (const [route, name] of Object.entries(pageNames)) {
    if (route !== '/' && pathname.startsWith(route)) {
      return name;
    }
  }

  return 'Dashboard';
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const pageName = getPageName(pathname);
  const { isAuthenticated, setupRequired, isLoading } = useAuth();

  // Redirect to login/setup if not authenticated
  useEffect(() => {
    if (isLoading) return;

    if (setupRequired) {
      router.push('/setup');
    } else if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, setupRequired, isLoading, router]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Don't render layout if not authenticated (redirect will happen)
  if (!isAuthenticated || setupRequired) {
    return null;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{pageName}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Centered sync status indicator */}
          <SyncStatusHeader />
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col p-4 pt-4 sm:p-6 lg:pt-6">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
