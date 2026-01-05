'use client';

import { formatDistanceToNow } from 'date-fns';
import { Server, ArrowRight, Activity } from 'lucide-react';
import Link from 'next/link';

import type { DashboardSource } from '@/lib/api';

import { AddSourceModal } from '@/components/add-source-modal';
import { ConnectionStatus } from '@/components/connection-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SourceStatusProps {
  sources: DashboardSource[];
  loading?: boolean;
}

export function SourceStatus({ sources, loading }: SourceStatusProps) {
  if (loading) {
    return (
      <Card className="flex min-h-0 flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Source Status</CardTitle>
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
          <CardTitle className="text-sm font-medium">Source Status</CardTitle>
          <Link href="/sources">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              Manage
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto">
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Server className="text-muted-foreground mb-2 h-8 w-8" />
            <p className="text-muted-foreground mb-3 text-sm">No sources configured</p>
            <AddSourceModal
              trigger={
                <Button size="sm" variant="outline">
                  Add Your First Source
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className="bg-muted/30 flex items-center justify-between rounded-lg p-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <ConnectionStatus
                    apiConnected={source.isConnected}
                    fileIngestionEnabled={source.fileIngestionEnabled}
                    fileIngestionConnected={source.fileIngestionConnected}
                    lastSeen={source.lastSeen}
                    variant="dot"
                  />
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium">{source.name}</span>
                    {source.version && (
                      <span className="text-muted-foreground text-xs">v{source.version}</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {source.activeStreams > 0 && (
                    <div className="flex items-center gap-1 text-xs text-green-500">
                      <Activity className="h-3 w-3" />
                      <span>{source.activeStreams}</span>
                    </div>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {source.lastSeen
                      ? formatDistanceToNow(new Date(source.lastSeen), { addSuffix: true })
                      : 'Never'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
