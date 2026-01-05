'use client';

import { AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import type { DashboardTopIssue } from '@/lib/api';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface TopIssuesProps {
  issues: DashboardTopIssue[];
  loading?: boolean;
}

function getSeverityConfig(severity: string) {
  switch (severity) {
    case 'critical':
      return { color: 'text-red-500', bg: 'bg-red-500/10', badge: 'destructive' as const };
    case 'high':
      return { color: 'text-orange-500', bg: 'bg-orange-500/10', badge: 'default' as const };
    case 'medium':
      return { color: 'text-yellow-500', bg: 'bg-yellow-500/10', badge: 'secondary' as const };
    default:
      return { color: 'text-blue-500', bg: 'bg-blue-500/10', badge: 'outline' as const };
  }
}

export function TopIssues({ issues, loading }: TopIssuesProps) {
  if (loading) {
    return (
      <Card className="flex min-h-0 flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top Issues</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Top Issues</CardTitle>
          <Link href="/issues">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              View All
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto">
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertTriangle className="text-muted-foreground mb-2 h-8 w-8" />
            <p className="text-muted-foreground text-sm">No open issues</p>
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((issue) => {
              const config = getSeverityConfig(issue.severity);
              return (
                <Link key={issue.id} href={`/issues?id=${issue.id}`}>
                  <div
                    className={cn(
                      'hover:bg-muted/50 flex items-center justify-between rounded-lg p-2.5 transition-colors',
                      config.bg
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Badge variant={config.badge} className="shrink-0 px-1.5 py-0 text-[10px]">
                        {issue.severity}
                      </Badge>
                      <span className="truncate text-sm">{issue.title}</span>
                    </div>
                    <div className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
                      <span className="tabular-nums">{issue.occurrenceCount}x</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
