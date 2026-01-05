'use client';

import {
  LayoutDashboard,
  Server,
  ScrollText,
  Activity,
  AlertTriangle,
  Settings,
  Sparkles,
  Database,
  Wifi,
  Container,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { ServiceStatus } from '@/lib/api';
import type { LucideIcon } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useHealth,
  useServers,
  useActiveSessions,
  useLogStats,
  useIssueStats,
  useDefaultAiProvider,
} from '@/hooks/use-api';
import { cn } from '@/lib/utils';

interface ServiceStatusIndicatorProps {
  name: string;
  shortName: string;
  icon: LucideIcon;
  status: ServiceStatus | undefined;
  isCollapsed: boolean;
}

function ServiceStatusIndicator({
  name,
  shortName,
  icon: Icon,
  status,
  isCollapsed,
}: ServiceStatusIndicatorProps) {
  const isOk = status?.status === 'ok';
  const latency = status?.latency;
  const error = status?.error;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex cursor-default items-center gap-1.5">
          <Icon className={cn('h-4 w-4 shrink-0', isOk ? 'text-green-500' : 'text-red-500')} />
          {!isCollapsed && <span>{shortName}</span>}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="p-0">
        <div className="space-y-1.5 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className={cn('h-2 w-2 rounded-full', isOk ? 'bg-green-500' : 'bg-red-500')} />
            <span className="text-sm font-medium">{name}</span>
          </div>
          <div className="text-muted-foreground space-y-0.5 text-xs">
            <div className="flex justify-between gap-4">
              <span>Status</span>
              <span className={cn('font-medium', isOk ? 'text-green-500' : 'text-red-500')}>
                {isOk ? 'Connected' : 'Error'}
              </span>
            </div>
            {latency !== undefined && (
              <div className="flex justify-between gap-4">
                <span>Latency</span>
                <span
                  className={cn(
                    'font-medium tabular-nums',
                    latency < 50
                      ? 'text-green-500'
                      : latency < 200
                        ? 'text-yellow-500'
                        : 'text-red-500'
                  )}
                >
                  {latency}ms
                </span>
              </div>
            )}
            {error && (
              <div className="mt-1 max-w-[200px] text-xs wrap-break-word text-red-400">{error}</div>
            )}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';
  const { data: health } = useHealth();
  const { data: servers } = useServers();
  const { data: activeSessions } = useActiveSessions();
  const { data: logStats } = useLogStats();
  const { data: issueStats } = useIssueStats();
  const { data: defaultAiProvider } = useDefaultAiProvider();

  const connectedServers = servers?.filter((s) => s.isConnected).length ?? 0;
  const totalServers = servers?.length ?? 0;
  const activeSessionCount = activeSessions?.length ?? 0;
  const errorCount = logStats?.errorCount ?? 0;
  const warnCount = logStats?.warnCount ?? 0;
  const openIssueCount = issueStats?.openIssues ?? 0;
  const criticalIssueCount = issueStats?.criticalIssues ?? 0;
  const hasAiConfigured = !!defaultAiProvider;

  // Format large numbers (1000 -> 1k, 10000 -> 10k)
  const formatCount = (count: number): string => {
    if (count >= 10000) return `${Math.floor(count / 1000)}k`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
  };

  const mainNavItems = [
    {
      title: 'Dashboard',
      href: '/',
      icon: LayoutDashboard,
      iconColor: 'text-blue-500',
      badge: null as string | number | null,
      badgeColor: '',
    },
    {
      title: 'Sources',
      href: '/sources',
      icon: Server,
      iconColor: 'text-purple-500',
      badge: totalServers > 0 ? `${connectedServers}/${totalServers}` : null,
      badgeColor:
        connectedServers === totalServers && totalServers > 0
          ? 'text-green-500'
          : 'text-yellow-500',
    },
    {
      title: 'Issues',
      href: '/issues',
      icon: AlertTriangle,
      iconColor: 'text-orange-500',
      badge: openIssueCount > 0 ? formatCount(openIssueCount) : null,
      badgeColor:
        criticalIssueCount > 0 ? 'text-red-500 bg-red-500/10' : 'text-orange-500 bg-orange-500/10',
    },
    {
      title: 'Logs',
      href: '/logs',
      icon: ScrollText,
      iconColor: 'text-emerald-500',
      badge:
        errorCount > 0 ? formatCount(errorCount) : warnCount > 0 ? formatCount(warnCount) : null,
      badgeColor:
        errorCount > 0 ? 'text-red-500 bg-red-500/10' : 'text-yellow-500 bg-yellow-500/10',
    },
    {
      title: 'Sessions',
      href: '/sessions',
      icon: Activity,
      iconColor: 'text-cyan-500',
      badge: activeSessionCount > 0 ? activeSessionCount : null,
      badgeColor: 'text-blue-500 bg-blue-500/10',
    },
  ];

  const settingsNavItems = [
    {
      title: 'Settings',
      href: '/settings',
      icon: Settings,
      iconColor: 'text-zinc-400',
      badge: null as string | number | null,
      badgeColor: '',
    },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader
        className={cn(
          'border-border h-16 shrink-0 items-center border-b',
          isCollapsed ? 'justify-center px-2' : 'flex-row! gap-0 px-4'
        )}
      >
        <Link href="/" className="flex items-center gap-2">
          <ScrollText className="text-primary h-6 w-6 shrink-0" />
          {!isCollapsed && <span className="text-xl font-semibold">Logarr</span>}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    size="lg"
                    className="gap-3"
                    tooltip={item.badge ? `${item.title} (${item.badge})` : item.title}
                  >
                    <Link href={item.href} className="relative">
                      <item.icon className={cn('h-5 w-5 shrink-0', item.iconColor)} />
                      <span className="font-medium">{item.title}</span>
                      {/* Badge indicator dot for collapsed state */}
                      {isCollapsed && item.badge && (
                        <span
                          className={cn(
                            'absolute -top-1 -right-1 h-2 w-2 rounded-full',
                            item.badgeColor.includes('red')
                              ? 'bg-red-500'
                              : item.badgeColor.includes('orange')
                                ? 'bg-orange-500'
                                : item.badgeColor.includes('yellow')
                                  ? 'bg-yellow-500'
                                  : item.badgeColor.includes('blue')
                                    ? 'bg-blue-500'
                                    : 'bg-green-500'
                          )}
                        />
                      )}
                    </Link>
                  </SidebarMenuButton>
                  {!isCollapsed && item.badge && (
                    <SidebarMenuBadge
                      className={cn('rounded px-1.5 text-xs font-medium', item.badgeColor)}
                    >
                      {item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          {!isCollapsed && (
            <SidebarGroupLabel className="text-muted-foreground px-2 text-xs tracking-wide uppercase">
              System
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href || pathname.startsWith(item.href + '/')}
                    size="lg"
                    className="gap-3"
                    tooltip={
                      !hasAiConfigured && item.href === '/settings'
                        ? 'Settings (Setup AI)'
                        : item.title
                    }
                  >
                    <Link href={item.href} className="relative">
                      <item.icon className={cn('h-5 w-5 shrink-0', item.iconColor)} />
                      <span className="font-medium">{item.title}</span>
                      {/* AI setup indicator for collapsed state */}
                      {isCollapsed && !hasAiConfigured && item.href === '/settings' && (
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-yellow-500" />
                      )}
                    </Link>
                  </SidebarMenuButton>
                  {!isCollapsed && !hasAiConfigured && item.href === '/settings' && (
                    <SidebarMenuBadge className="rounded bg-yellow-500/10 px-1.5 text-xs font-medium text-yellow-500">
                      <Sparkles className="h-3 w-3" />
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={cn('border-border border-t', isCollapsed ? 'p-2' : 'px-4 py-3')}>
        <div
          className={cn(
            'text-muted-foreground flex text-xs',
            isCollapsed ? 'flex-col items-center gap-2' : 'flex-row items-center justify-between'
          )}
        >
          {/* API Status */}
          <ServiceStatusIndicator
            name="API"
            shortName="API"
            icon={Wifi}
            status={health?.services?.api}
            isCollapsed={isCollapsed}
          />
          {/* Database Status */}
          <ServiceStatusIndicator
            name="Database"
            shortName="DB"
            icon={Database}
            status={health?.services?.database}
            isCollapsed={isCollapsed}
          />
          {/* Cache Status */}
          <ServiceStatusIndicator
            name="Cache"
            shortName="Cache"
            icon={Container}
            status={health?.services?.redis}
            isCollapsed={isCollapsed}
          />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
