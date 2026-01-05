'use client';

import type { HeatmapDay } from '@/lib/api';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ActivityHeatmapProps {
  data: HeatmapDay[];
  loading?: boolean;
}

function getIntensityClass(value: number): string {
  if (value === 0) return 'bg-muted/30';
  if (value < 20) return 'bg-primary/20';
  if (value < 40) return 'bg-primary/40';
  if (value < 60) return 'bg-primary/60';
  if (value < 80) return 'bg-primary/80';
  return 'bg-primary';
}

export function ActivityHeatmap({ data, loading }: ActivityHeatmapProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">7-Day Activity Pattern</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[160px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const hourLabels = [0, 6, 12, 18, 23];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">7-Day Activity Pattern</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {/* Hour labels */}
          <div className="flex gap-0.5 pl-10">
            {hours.map((hour) => (
              <div key={hour} className="text-muted-foreground flex-1 text-center text-[10px]">
                {hourLabels.includes(hour) ? `${hour}h` : ''}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <TooltipProvider delayDuration={100}>
            {data.map((day) => (
              <div key={day.day} className="flex items-center gap-1">
                <span className="text-muted-foreground w-8 text-right text-xs">{day.day}</span>
                <div className="flex flex-1 gap-0.5">
                  {day.hours.map((value, hourIndex) => (
                    <Tooltip key={hourIndex}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            'h-4 flex-1 cursor-default rounded-sm transition-colors',
                            getIntensityClass(value)
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        <p>
                          {day.day} {hourIndex}:00
                        </p>
                        <p className="text-muted-foreground">Activity: {value}%</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}
          </TooltipProvider>

          {/* Legend */}
          <div className="text-muted-foreground mt-2 flex items-center justify-end gap-1 text-[10px]">
            <span>Less</span>
            <div className="flex gap-0.5">
              <div className="bg-muted/30 h-3 w-3 rounded-sm" />
              <div className="bg-primary/20 h-3 w-3 rounded-sm" />
              <div className="bg-primary/40 h-3 w-3 rounded-sm" />
              <div className="bg-primary/60 h-3 w-3 rounded-sm" />
              <div className="bg-primary/80 h-3 w-3 rounded-sm" />
              <div className="bg-primary h-3 w-3 rounded-sm" />
            </div>
            <span>More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
