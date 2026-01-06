'use client';

import { useState, useEffect, useId } from 'react';

import { type Integration, getDashboardIconUrl, getIntegrationById } from '@/lib/integrations';
import { cn } from '@/lib/utils';

interface IntegrationIconProps {
  integration: Integration;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  xs: 'h-4 w-4',
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

// Jellyfin icon component with unique gradient IDs
function JellyfinBuiltInIcon({ className }: { className?: string }) {
  const id = useId();
  const gradientId = `jellyfin-gradient-${id}`;

  return (
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient
          id={gradientId}
          x1="110.25"
          y1="213.3"
          x2="496.14"
          y2="436.09"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#AA5CC3" />
          <stop offset="1" stopColor="#00A4DC" />
        </linearGradient>
      </defs>
      <path
        d="M256,201.6c-20.4,0-86.2,119.3-76.2,139.4s142.5,19.9,152.4,0S276.5,201.6,256,201.6z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M256,23.3c-61.6,0-259.8,359.4-229.6,420.1s429.3,60,459.2,0S317.6,23.3,256,23.3z M406.5,390.8c-19.6,39.3-281.1,39.8-300.9,0s110.1-275.3,150.4-275.3S426.1,351.4,406.5,390.8z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}

// Google icon component with unique gradient IDs
function GoogleBuiltInIcon({ className }: { className?: string }) {
  const id = useId();
  const gradientId = `google-gemini-gradient-${id}`;

  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="25%" stopColor="#9B72CB" />
          <stop offset="50%" stopColor="#D96570" />
          <stop offset="75%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#4285F4" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M12 0C5.373 0 0 5.373 0 12c0 4.992 3.048 9.267 7.385 11.072C6.516 21.267 6 19.2 6 17c0-5.523 4.477-10 10-10 1.2 0 2.35.21 3.42.6C17.735 3.048 13.992 0 12 0zm0 6c-3.314 0-6 2.686-6 6s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6z"
      />
      <circle fill={`url(#${gradientId})`} cx="12" cy="12" r="4" />
    </svg>
  );
}

// Built-in SVG icons for currently implemented providers
const builtInIcons: Record<string, React.FC<{ className?: string }>> = {
  jellyfin: JellyfinBuiltInIcon,
  plex: ({ className }) => (
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="512" height="512" fill="#282a2d" rx="15%" />
      <path fill="#e5a00d" d="M256 70H148l108 186-108 186h108l108-186z" />
    </svg>
  ),
  sonarr: ({ className }) => (
    <svg viewBox="0 0 216.7 216.9" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        clipRule="evenodd"
        d="M216.7 108.45c0 29.833-10.533 55.4-31.6 76.7-.7.833-1.483 1.6-2.35 2.3-3.466 3.4-7.133 6.484-11 9.25-18.267 13.467-39.367 20.2-63.3 20.2-23.967 0-45.033-6.733-63.2-20.2-4.8-3.4-9.3-7.25-13.5-11.55-16.367-16.266-26.417-35.167-30.15-56.7-.733-4.2-1.217-8.467-1.45-12.8-.1-2.4-.15-4.8-.15-7.2 0-2.533.05-4.95.15-7.25 0-.233.066-.467.2-.7 1.567-26.6 12.033-49.583 31.4-68.95C53.05 10.517 78.617 0 108.45 0c29.933 0 55.484 10.517 76.65 31.55 21.067 21.433 31.6 47.067 31.6 76.9z"
        fill="#EEE"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M194.65 42.5l-22.4 22.4C159.152 77.998 158 89.4 158 109.5c0 17.934 2.852 34.352 16.2 47.7 9.746 9.746 19 18.95 19 18.95-2.5 3.067-5.2 6.067-8.1 9-.7.833-1.483 1.6-2.35 2.3-2.533 2.5-5.167 4.817-7.9 6.95l-17.55-17.55c-15.598-15.6-27.996-17.1-48.6-17.1-19.77 0-33.223 1.822-47.7 16.3-8.647 8.647-18.55 18.6-18.55 18.6-3.767-2.867-7.333-6.034-10.7-9.5-2.8-2.8-5.417-5.667-7.85-8.6 0 0 9.798-9.848 19.15-19.2 13.852-13.853 16.1-29.916 16.1-47.85 0-17.5-2.874-33.823-15.6-46.55-8.835-8.836-21.05-21-21.05-21 2.833-3.6 5.917-7.067 9.25-10.4 2.934-2.867 5.934-5.55 9-8.05L61.1 43.85C74.102 56.852 90.767 60.2 108.7 60.2c18.467 0 35.077-3.577 48.6-17.1 8.32-8.32 19.3-19.25 19.3-19.25 2.9 2.367 5.733 4.933 8.5 7.7 3.467 3.533 6.65 7.183 9.55 10.95z"
        fill="#3A3F51"
        fillRule="evenodd"
      />
      <g clipRule="evenodd">
        <path
          d="M78.7 114c-.2-1.167-.332-2.35-.4-3.55-.032-.667-.05-1.333-.05-2 0-.7.018-1.367.05-2 0-.067.018-.133.05-.2.435-7.367 3.334-13.733 8.7-19.1 5.9-5.833 12.984-8.75 21.25-8.75 8.3 0 15.384 2.917 21.25 8.75 5.834 5.934 8.75 13.033 8.75 21.3 0 8.267-2.916 15.35-8.75 21.25-.2.233-.416.45-.65.65-.966.933-1.982 1.783-3.05 2.55-5.065 3.733-10.916 5.6-17.55 5.6s-12.466-1.866-17.5-5.6c-1.332-.934-2.582-2-3.75-3.2-4.532-4.5-7.316-9.734-8.35-15.7z"
          fill="#0CF"
          fillRule="evenodd"
        />
        <path
          d="M157.8 59.75l-15 14.65M30.785 32.526L71.65 73.25m84.6 84.25l27.808 28.78m1.855-153.894L157.8 59.75m-125.45 126l27.35-27.4"
          fill="none"
          stroke="#0CF"
          strokeMiterlimit="1"
          strokeWidth="2"
        />
        <path
          d="M157.8 59.75l-16.95 17.2M58.97 60.604l17.2 17.15M59.623 158.43l16.75-17.4m61.928-1.396l18.028 17.945"
          fill="none"
          stroke="#0CF"
          strokeMiterlimit="1"
          strokeWidth="7"
        />
      </g>
    </svg>
  ),
  radarr: ({ className }) => (
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="m80.3 80.8 3.9 372.4c-31.4 3.9-54.9-11.8-54.9-43.1l-3.9-309.7c0-98 90.2-121.5 145.1-82.3l278.3 160.7c39.2 27.4 47 78.4 27.4 113.7-3.9-27.4-15.7-43.1-39.2-58.8L123.4 57.2C99.9 41.6 80.3 45.5 80.3 80.8m-23.5 392c23.5 7.8 47 3.9 66.6-7.8l321.5-188.2c19.6 27.4 15.7 54.9-7.8 70.6L166.5 504.2c-39.2 19.6-90.1 0-109.7-31.4"
        fill="#24292e"
      />
      <path d="M150.9 363 343 253.3 154.8 147.4z" fill="#ffc230" />
    </svg>
  ),
  prowlarr: ({ className }) => (
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className}>
      <g transform="matrix(1.33333 0 0 -1.33333 198.628 515.837)">
        <g transform="translate(425.097 -1123.349)scale(4.096)">
          <circle cx="-93.3" cy="321.8" r="45" fill="#ffe6d5" />
          <path d="m-124.1 313.6 8.1 9.5 60.7.2-7.9-9.7z" fill="#83331b" />
          <path
            d="M-124.1 313.6v-25.5c4.6-.2 8.1-2 8.1-4.1h47.2c-.4.5-.6 1.1-.6 1.7 0 2.2 2.7 4 6.2 4.2v23.7z"
            fill="#f8a37b"
          />
          <path
            d="M-98.9 336.2s7.2 8.5 21.9 6.5c14.7-2.1 20.1-21.2 20.1-21.2l-6.3-7.9h-35.7z"
            fill="#ef5d22"
          />
          <path
            d="M-107.7 332.1c.6-2.7-1.2-5.3-3.8-5.8-2.7-.6-5.3 1.2-5.8 3.8-.6 2.7 1.2 5.3 3.8 5.8 2.6.6 5.2-1.1 5.8-3.8"
            fill="#d4541e"
          />
          <path
            d="M-109.9 331.6c.3-1.5-.6-2.9-2.1-3.3-1.5-.3-2.9.6-3.3 2.1-.3 1.5.6 2.9 2.1 3.3 1.6.4 3-.6 3.3-2.1"
            fill="#fff"
          />
          <path
            d="M-82.2 332.8c-.6-2.7 1.2-5.3 3.8-5.8 2.7-.6 5.3 1.2 5.8 3.8.6 2.7-1.2 5.3-3.8 5.8s-5.3-1.2-5.8-3.8"
            fill="#d4541e"
          />
          <path
            d="M-80.1 332.3c-.3-1.5.6-2.9 2.1-3.3 1.5-.3 2.9.6 3.3 2.1.3 1.5-.6 2.9-2.1 3.3-1.5.3-3-.6-3.3-2.1"
            fill="#fff"
          />
          <path
            d="m-117.9 313.6-2.4 2.5s7.7 15.7 18.4 19.4c10.6 3.6 19-1.8 24.2-6.3s8.2-13.5 8.2-13.5l-1.9-2.1z"
            fill="#f46a2f"
          />
          <path d="M-71.5 313.6h-46.4l-2.4 2.4h50.1l.6-.3z" fill="#d5d0cd" />
          <path
            d="M-99.6 320.1s-2.8-.7-3.9-3.4c-1-2.7.4-4.7 2.7-5.2 2.4-.5 5.8 1.2 5.8 1.2s2.8-2.7 6.2-2 4.5 4.5 2.8 6.9c-1.6 2.3-5.6 2.6-5.6 2.6s-6.1-1.8-8-.1"
            fill="#fff"
          />
          <path
            d="M-100.5 323.3c0-1.6-1.3-3-3-3-1.6 0-3 1.3-3 3 0 1.6 1.3 3 3 3s3-1.3 3-3"
            fill="#fddd04"
          />
          <path
            d="M-101.3 323.3c0-1.2-1-2.1-2.1-2.1-1.2 0-2.1 1-2.1 2.1s1 2.1 2.1 2.1 2.1-.9 2.1-2.1"
            fill="#391913"
          />
          <path
            d="M-83.6 323.3c0-1.6-1.3-3-3-3-1.6 0-3 1.3-3 3 0 1.6 1.3 3 3 3s3-1.3 3-3"
            fill="#fddd04"
          />
          <path
            d="M-84.4 323.3c0-1.2-1-2.1-2.1-2.1-1.2 0-2.1 1-2.1 2.1s.9 2.1 2.1 2.1c1.1 0 2.1-.9 2.1-2.1"
            fill="#391913"
          />
          <path
            d="M-93.3 368.7c-25.9 0-46.9-21-46.9-46.9s21-46.9 46.9-46.9 46.9 21 46.9 46.9-21 46.9-46.9 46.9m0-9.4c20.7 0 37.5-16.8 37.5-37.5s-16.8-37.5-37.5-37.5-37.5 16.8-37.5 37.5 16.8 37.5 37.5 37.5"
            fill="#e66001"
          />
        </g>
      </g>
    </svg>
  ),
  openai: ({ className }) => (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="currentColor"
    >
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  ),
  anthropic: ({ className }) => (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="currentColor"
    >
      <path d="M17.304 3.541h-3.672l6.696 16.918h3.672zm-10.608 0L0 20.459h3.744l1.368-3.6h6.624l1.368 3.6h3.744L10.152 3.541zm-.264 10.392 2.04-5.352 2.04 5.352z" />
    </svg>
  ),
  google: GoogleBuiltInIcon,
};

// Fallback icon when external icon fails to load
function FallbackIcon({ className, color }: { className?: string; color: string }) {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="100" height="100" rx="20" fill={color} opacity="0.2" />
      <rect x="25" y="30" width="50" height="15" rx="3" fill={color} />
      <rect x="25" y="55" width="50" height="15" rx="3" fill={color} />
      <circle cx="35" cy="37.5" r="3" fill="white" />
      <circle cx="35" cy="62.5" r="3" fill="white" />
    </svg>
  );
}

// Cache for loaded external icons
const iconCache = new Map<string, string>();
const failedIcons = new Set<string>();

export function IntegrationIcon({ integration, className, size = 'md' }: IntegrationIconProps) {
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  const sizeClass = sizeClasses[size];

  useEffect(() => {
    // Reset state when integration changes
    setHasError(false);
    setIconUrl(null);

    if (integration.iconType === 'builtin') {
      // Built-in icons are handled by the component directly
      return;
    }

    if (integration.iconType === 'dashboard-icons') {
      const slug = integration.icon;

      // Check if already failed
      if (failedIcons.has(slug)) {
        setHasError(true);
        return;
      }

      // Check cache
      if (iconCache.has(slug)) {
        setIconUrl(iconCache.get(slug)!);
        return;
      }

      // Try to load from dashboard icons CDN
      const url = getDashboardIconUrl(slug, 'svg');

      // Preload the image
      const img = new Image();
      img.onload = () => {
        iconCache.set(slug, url);
        setIconUrl(url);
      };
      img.onerror = () => {
        failedIcons.add(slug);
        setHasError(true);
      };
      img.src = url;
    }

    if (integration.iconType === 'url') {
      setIconUrl(integration.icon);
    }
  }, [integration]);

  // Render built-in icon
  if (integration.iconType === 'builtin') {
    const BuiltInIcon = builtInIcons[integration.icon];
    if (BuiltInIcon) {
      return <BuiltInIcon className={cn(sizeClass, className)} />;
    }
  }

  // Render external icon from URL or dashboard icons
  if (iconUrl && !hasError) {
    return (
      <img
        src={iconUrl}
        alt={`${integration.name} icon`}
        className={cn(sizeClass, 'object-contain', className)}
        onError={() => {
          failedIcons.add(integration.icon);
          setHasError(true);
        }}
      />
    );
  }

  // Render fallback
  return <FallbackIcon className={cn(sizeClass, className)} color={integration.color} />;
}

// Simple icon component for when you just need to show an icon by integration ID
export function IntegrationIconById({
  integrationId,
  className,
  size = 'md',
}: {
  integrationId: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}) {
  const integration = getIntegrationById(integrationId);

  if (!integration) {
    return <FallbackIcon className={cn(sizeClasses[size], className)} color="#6B7280" />;
  }

  return <IntegrationIcon integration={integration} className={className} size={size} />;
}
