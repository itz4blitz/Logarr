'use client';

import { usePathname } from 'next/navigation';

import { AppSidebar } from '@/components/app-sidebar';
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
  const pageName = getPageName(pathname);

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
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col p-4 pt-4 sm:p-6 lg:pt-6">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
