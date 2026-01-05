'use client';

import { Search, Check, Clock, Sparkles, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';

import { IntegrationIcon } from '@/components/integration-icon';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  integrations,
  integrationCategories,
  searchIntegrations,
  type Integration,
  type IntegrationCategory,
} from '@/lib/integrations';
import { cn } from '@/lib/utils';

interface IntegrationPickerProps {
  onSelect: (integration: Integration) => void;
  selectedId?: string;
}

// Category icons mapping
const categoryIcons: Record<string, React.ReactNode> = {
  media_servers: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10,8 16,12 10,16" />
    </svg>
  ),
  arr_stack: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="6" rx="1" />
      <rect x="3" y="11" width="18" height="6" rx="1" />
      <line x1="7" y1="6" x2="7" y2="6" />
      <line x1="7" y1="14" x2="7" y2="14" />
    </svg>
  ),
  download_clients: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  network_dns: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  containers: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  home_automation: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  ),
  monitoring: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
    </svg>
  ),
  security: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  databases: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  web_apps: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  ),
  media_requests: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  vpn: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  ai_providers: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 9h6v6H9z" />
      <path d="M9 1v3" />
      <path d="M15 1v3" />
      <path d="M9 20v3" />
      <path d="M15 20v3" />
      <path d="M20 9h3" />
      <path d="M20 14h3" />
      <path d="M1 9h3" />
      <path d="M1 14h3" />
    </svg>
  ),
  generic: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="4,17 10,11 4,5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
};

function StatusBadge({ status }: { status: Integration['status'] }) {
  if (status === 'available') {
    return (
      <Badge
        variant="outline"
        className="border-green-500/20 bg-green-500/10 px-1.5 py-0 text-[10px] text-green-600 dark:text-green-400"
      >
        <Check className="mr-0.5 h-2.5 w-2.5" />
        Ready
      </Badge>
    );
  }

  if (status === 'beta') {
    return (
      <Badge
        variant="outline"
        className="border-purple-500/20 bg-purple-500/10 px-1.5 py-0 text-[10px] text-purple-600 dark:text-purple-400"
      >
        <Sparkles className="mr-0.5 h-2.5 w-2.5" />
        Beta
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-amber-500/20 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400"
    >
      <Clock className="mr-0.5 h-2.5 w-2.5" />
      Soon
    </Badge>
  );
}

interface IntegrationCardProps {
  integration: Integration;
  isSelected: boolean;
  onClick: () => void;
}

function IntegrationCard({ integration, isSelected, onClick }: IntegrationCardProps) {
  const isAvailable = integration.status === 'available';

  return (
    <button
      onClick={onClick}
      disabled={!isAvailable}
      className={cn(
        'group relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-200',
        'focus-visible:ring-ring hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'integration-card-hover',
        isSelected ? 'border-primary bg-primary/5' : 'border-transparent',
        isAvailable
          ? 'bg-card hover:bg-accent/50 cursor-pointer'
          : 'bg-muted/30 cursor-not-allowed opacity-75'
      )}
    >
      {/* Icon container with brand-colored background */}
      <div
        className={cn(
          'relative flex h-14 w-14 items-center justify-center rounded-xl transition-transform duration-200',
          isAvailable && 'group-hover:scale-110'
        )}
        style={{ backgroundColor: `${integration.color}15` }}
      >
        <IntegrationIcon integration={integration} size="lg" />
      </div>

      {/* Name and status */}
      <div className="flex flex-col items-center gap-1 text-center">
        <span
          className={cn(
            'line-clamp-1 text-sm font-medium',
            !isAvailable && 'text-muted-foreground'
          )}
        >
          {integration.name}
        </span>
        <StatusBadge status={integration.status} />
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="bg-primary absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full">
          <Check className="text-primary-foreground h-3 w-3" />
        </div>
      )}
    </button>
  );
}

export function IntegrationPicker({ onSelect, selectedId }: IntegrationPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<IntegrationCategory | 'all'>('all');

  // Filter and search integrations
  const filteredIntegrations = useMemo(() => {
    let result = searchQuery ? searchIntegrations(searchQuery) : integrations;

    if (selectedCategory !== 'all') {
      result = result.filter((i) => i.category === selectedCategory);
    }

    // Sort: available first, then by name
    return result.sort((a, b) => {
      if (a.status === 'available' && b.status !== 'available') return -1;
      if (a.status !== 'available' && b.status === 'available') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [searchQuery, selectedCategory]);

  // Group integrations by category for display
  const groupedIntegrations = useMemo(() => {
    if (selectedCategory !== 'all') {
      return [{ category: selectedCategory, integrations: filteredIntegrations }];
    }

    const groups: { category: IntegrationCategory; integrations: Integration[] }[] = [];

    for (const category of integrationCategories) {
      const categoryIntegrations = filteredIntegrations.filter((i) => i.category === category.id);
      if (categoryIntegrations.length > 0) {
        groups.push({ category: category.id, integrations: categoryIntegrations });
      }
    }

    return groups;
  }, [filteredIntegrations, selectedCategory]);

  // Count available vs total
  const availableCount = integrations.filter((i) => i.status === 'available').length;
  const totalCount = integrations.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search and filter bar */}
      <div className="flex shrink-0 flex-col gap-3 border-b pb-4">
        {/* Search input */}
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              selectedCategory === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
            )}
          >
            All ({totalCount})
          </button>
          {integrationCategories.map((category) => {
            const count = integrations.filter((i) => i.category === category.id).length;
            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  selectedCategory === category.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                )}
              >
                {categoryIcons[category.id]}
                <span>{category.name}</span>
                <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Stats */}
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>
            {availableCount} available, {totalCount - availableCount} coming soon
          </span>
          {searchQuery && (
            <span>
              {filteredIntegrations.length} result{filteredIntegrations.length !== 1 && 's'}
            </span>
          )}
        </div>
      </div>

      {/* Integration grid */}
      <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
        <div className="space-y-6 py-4">
          {groupedIntegrations.map(({ category, integrations: categoryIntegrations }) => {
            const categoryInfo = integrationCategories.find((c) => c.id === category);

            return (
              <div key={category}>
                {/* Category header */}
                {selectedCategory === 'all' && (
                  <div className="mb-3 flex items-center gap-2">
                    <div className="text-foreground flex items-center gap-2 text-sm font-medium">
                      {categoryIcons[category]}
                      <span>{categoryInfo?.name}</span>
                    </div>
                    <div className="bg-border h-px flex-1" />
                    <span className="text-muted-foreground text-xs">
                      {categoryIntegrations.length}
                    </span>
                  </div>
                )}

                {/* Integration cards grid */}
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {categoryIntegrations.map((integration) => (
                    <IntegrationCard
                      key={integration.id}
                      integration={integration}
                      isSelected={selectedId === integration.id}
                      onClick={() => {
                        if (integration.status === 'available') {
                          onSelect(integration);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {filteredIntegrations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="text-muted-foreground/50 mb-4 h-12 w-12" />
              <h3 className="text-lg font-medium">No integrations found</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                Try adjusting your search or filter criteria
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Compact version for quick selection
export function IntegrationPickerCompact({
  onSelect,
  selectedId,
  category,
}: IntegrationPickerProps & { category?: IntegrationCategory }) {
  const filteredIntegrations = useMemo(() => {
    let result = integrations;
    if (category) {
      result = result.filter((i) => i.category === category);
    }
    return result.sort((a, b) => {
      if (a.status === 'available' && b.status !== 'available') return -1;
      if (a.status !== 'available' && b.status === 'available') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [category]);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {filteredIntegrations.slice(0, 6).map((integration) => (
        <button
          key={integration.id}
          onClick={() => integration.status === 'available' && onSelect(integration)}
          disabled={integration.status !== 'available'}
          className={cn(
            'flex items-center gap-3 rounded-lg border p-3 transition-all',
            'hover:bg-accent/50 focus:ring-ring focus:ring-2 focus:outline-none',
            selectedId === integration.id && 'ring-primary border-primary ring-2',
            integration.status !== 'available' && 'cursor-not-allowed opacity-50'
          )}
        >
          <IntegrationIcon integration={integration} size="md" />
          <div className="flex-1 text-left">
            <div className="text-sm font-medium">{integration.name}</div>
            <StatusBadge status={integration.status} />
          </div>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
