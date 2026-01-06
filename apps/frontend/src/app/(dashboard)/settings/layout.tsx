'use client';

import { Zap, BarChart3, Database } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const tabs = [
  {
    label: 'AI Providers',
    href: '/settings/ai-providers',
    icon: Zap,
  },
  {
    label: 'Usage Stats',
    href: '/settings/usage-stats',
    icon: BarChart3,
  },
  {
    label: 'Data Management',
    href: '/settings/data-management',
    icon: Database,
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Determine the active tab value based on current pathname
  const activeTab = tabs.find((tab) => pathname === tab.href)?.href || '/settings/ai-providers';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tab Navigation - Using shadcn Tabs with route-based Links */}
      <Tabs value={activeTab} className="flex h-full min-h-0 flex-col">
        <TabsList className="w-fit shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.href} value={tab.href} asChild>
                <Link href={tab.href} className="gap-2">
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab Content - scrollbar on far right edge on mobile */}
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
          {children}
        </div>
      </Tabs>
    </div>
  );
}
