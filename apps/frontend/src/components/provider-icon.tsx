import { getIntegrationById } from '@/lib/integrations';
import { cn } from '@/lib/utils';

interface ProviderIconProps {
  providerId: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

// Official Jellyfin logo - using useId for unique gradient IDs
import { useId } from 'react';

function JellyfinIcon({ className }: { className?: string }) {
  const id = useId();
  const gradientIdA = `jellyfin-gradient-a-${id}`;
  const gradientIdB = `jellyfin-gradient-b-${id}`;

  return (
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient
          id={gradientIdA}
          x1="97.508"
          y1="308.135"
          x2="522.069"
          y2="63.019"
          gradientTransform="matrix(1 0 0 -1 0 514)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#AA5CC3" />
          <stop offset="1" stopColor="#00A4DC" />
        </linearGradient>
        <linearGradient
          id={gradientIdB}
          x1="94.193"
          y1="302.394"
          x2="518.754"
          y2="57.278"
          gradientTransform="matrix(1 0 0 -1 0 514)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#AA5CC3" />
          <stop offset="1" stopColor="#00A4DC" />
        </linearGradient>
      </defs>
      <path
        d="M256 196.2c-22.4 0-94.8 131.3-83.8 153.4s156.8 21.9 167.7 0-61.3-153.4-83.9-153.4"
        fill={`url(#${gradientIdA})`}
      />
      <path
        d="M256 0C188.3 0-29.8 395.4 3.4 462.2s472.3 66 505.2 0S323.8 0 256 0m165.6 404.3c-21.6 43.2-309.3 43.8-331.1 0S211.7 101.4 256 101.4 443.2 361 421.6 404.3"
        fill={`url(#${gradientIdB})`}
      />
    </svg>
  );
}

// Official Sonarr logo
function SonarrIcon({ className }: { className?: string }) {
  return (
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
  );
}

// Official Radarr logo
function RadarrIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="m80.3 80.8 3.9 372.4c-31.4 3.9-54.9-11.8-54.9-43.1l-3.9-309.7c0-98 90.2-121.5 145.1-82.3l278.3 160.7c39.2 27.4 47 78.4 27.4 113.7-3.9-27.4-15.7-43.1-39.2-58.8L123.4 57.2C99.9 41.6 80.3 45.5 80.3 80.8m-23.5 392c23.5 7.8 47 3.9 66.6-7.8l321.5-188.2c19.6 27.4 15.7 54.9-7.8 70.6L166.5 504.2c-39.2 19.6-90.1 0-109.7-31.4"
        fill="#24292e"
      />
      <path d="M150.9 363 343 253.3 154.8 147.4z" fill="#ffc230" />
    </svg>
  );
}

// Official Prowlarr logo (owl/lion face)
function ProwlarrIcon({ className }: { className?: string }) {
  return (
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
  );
}

// Lidarr logo placeholder (green theme)
function LidarrIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="100" height="100" rx="20" fill="#00C853" />
      <circle cx="50" cy="50" r="25" fill="none" stroke="white" strokeWidth="6" />
      <circle cx="50" cy="50" r="8" fill="white" />
      <path
        d="M50 25v8M50 67v8M25 50h8M67 50h8"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Readarr logo placeholder (maroon theme)
function ReadarrIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="100" height="100" rx="20" fill="#8B0000" />
      <path d="M30 25h40v50H30z" fill="white" />
      <path
        d="M35 35h30M35 45h30M35 55h20"
        stroke="#8B0000"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// OpenAI logo
function OpenAIIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="currentColor"
    >
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

// Anthropic logo
function AnthropicIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="currentColor"
    >
      <path d="M17.304 3.541h-3.672l6.696 16.918h3.672zm-10.608 0L0 20.459h3.744l1.368-3.6h6.624l1.368 3.6h3.744L10.152 3.541zm-.264 10.392 2.04-5.352 2.04 5.352z" />
    </svg>
  );
}

// Ollama logo - official llama icon with white background for dark mode visibility
function OllamaIcon({ className }: { className?: string }) {
  return (
    <div className={className} style={{ position: 'relative' }}>
      <svg
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%' }}
      >
        <rect width="24" height="24" rx="4" fill="white" />
      </svg>
      <img
        src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/ollama.svg"
        alt="Ollama"
        style={{
          position: 'absolute',
          top: '10%',
          left: '10%',
          width: '80%',
          height: '80%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

// Google AI logo
function GoogleAIIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M12 11h8.533c.044.385.067.78.067 1.184 0 2.734-.98 5.036-2.678 6.6-1.485 1.371-3.518 2.175-5.942 2.175A8.976 8.976 0 0 1 3 12a8.976 8.976 0 0 1 8.98-8.959c2.42 0 4.453.89 6.008 2.339L16.526 6.87C15.368 5.79 13.803 5.2 12 5.2c-3.771 0-6.825 3.036-6.825 6.8s3.054 6.8 6.825 6.8c3.404 0 5.872-1.88 6.407-4.8H12V11z"
        fill="#4285F4"
      />
    </svg>
  );
}

// LM Studio logo - stylized "LM" text mark with brand colors
function LMStudioIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Background */}
      <rect width="24" height="24" rx="4" fill="#635BE1" />
      {/* L */}
      <path
        d="M5 6h2v10h4v2H5V6z"
        fill="white"
      />
      {/* M */}
      <path
        d="M13 6h2.5l1.5 6 1.5-6H21v12h-2V10l-1.5 6h-2L14 10v8h-2V6h1z"
        fill="white"
      />
    </svg>
  );
}

// Official SQLite logo - cylinder/disk stack
function SQLiteIcon({ className }: { className?: string }) {
  const id = useId();
  const gradientIds = {
    a: `sqlite-a-${id}`,
    b: `sqlite-b-${id}`,
    c: `sqlite-c-${id}`,
    d: `sqlite-d-${id}`,
    e: `sqlite-e-${id}`,
    f: `sqlite-f-${id}`,
    g: `sqlite-g-${id}`,
    h: `sqlite-h-${id}`,
    i: `sqlite-i-${id}`,
    j: `sqlite-j-${id}`,
    k: `sqlite-k-${id}`,
    l: `sqlite-l-${id}`,
    m: `sqlite-m-${id}`,
    n: `sqlite-n-${id}`,
    o: `sqlite-o-${id}`,
    p: `sqlite-p-${id}`,
    q: `sqlite-q-${id}`,
    r: `sqlite-r-${id}`,
  };

  return (
    <svg
      viewBox="8 10.52 240 237.48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={gradientIds.a}>
          <stop offset="0" style={{ stopColor: '#ababab', stopOpacity: 1 }} />
          <stop offset=".194" style={{ stopColor: '#f6f6f6', stopOpacity: 1 }} />
          <stop offset=".397" style={{ stopColor: '#b0b0b0', stopOpacity: 1 }} />
          <stop offset="1" style={{ stopColor: '#585858', stopOpacity: 1 }} />
        </linearGradient>
        <linearGradient id={gradientIds.b}>
          <stop offset="0" style={{ stopColor: '#a2a2a2', stopOpacity: 1 }} />
          <stop offset="1" style={{ stopColor: '#4e4e4e', stopOpacity: 1 }} />
        </linearGradient>
        <linearGradient id={gradientIds.c}>
          <stop offset="0" style={{ stopColor: '#fff', stopOpacity: 1 }} />
          <stop offset="1" style={{ stopColor: '#fff', stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient
          xlinkHref={`#${gradientIds.a}`}
          id={gradientIds.j}
          x1="10.116"
          x2="38.013"
          y1="17.512"
          y2="17.512"
          gradientTransform="translate(0 -1.714)"
          gradientUnits="userSpaceOnUse"
        />
        <linearGradient
          xlinkHref={`#${gradientIds.b}`}
          id={gradientIds.k}
          x1="24"
          x2="24"
          y1="15.149"
          y2="13.285"
          gradientUnits="userSpaceOnUse"
        />
        <linearGradient
          xlinkHref={`#${gradientIds.c}`}
          id={gradientIds.l}
          x1="16.071"
          x2="16.19"
          y1="19.5"
          y2="24.04"
          gradientTransform="translate(-.143 .929)"
          gradientUnits="userSpaceOnUse"
        />
        <linearGradient
          xlinkHref={`#${gradientIds.a}`}
          id={gradientIds.m}
          x1="10.116"
          x2="38.013"
          y1="17.512"
          y2="17.512"
          gradientTransform="translate(0 -1.714)"
          gradientUnits="userSpaceOnUse"
        />
        <linearGradient
          xlinkHref={`#${gradientIds.b}`}
          id={gradientIds.n}
          x1="24"
          x2="24"
          y1="15.149"
          y2="13.285"
          gradientUnits="userSpaceOnUse"
        />
        <linearGradient
          xlinkHref={`#${gradientIds.c}`}
          id={gradientIds.o}
          x1="16.071"
          x2="16.19"
          y1="19.5"
          y2="24.04"
          gradientTransform="translate(-.143 .929)"
          gradientUnits="userSpaceOnUse"
        />
        <linearGradient
          xlinkHref={`#${gradientIds.a}`}
          id={gradientIds.p}
          x1="10.116"
          x2="38.013"
          y1="17.512"
          y2="17.512"
          gradientTransform="translate(0 -1.714)"
          gradientUnits="userSpaceOnUse"
        />
        <linearGradient
          xlinkHref={`#${gradientIds.b}`}
          id={gradientIds.q}
          x1="24"
          x2="24"
          y1="15.149"
          y2="13.285"
          gradientUnits="userSpaceOnUse"
        />
        <linearGradient
          xlinkHref={`#${gradientIds.c}`}
          id={gradientIds.r}
          x1="16.071"
          x2="16.19"
          y1="19.5"
          y2="24.04"
          gradientTransform="translate(-.143 .929)"
          gradientUnits="userSpaceOnUse"
        />
      </defs>
      <g transform="matrix(8.59688 0 0 6.30047 -78.796 85.965)">
        <path
          d="M23.941 8.037c-7.625 0-13.825 2.13-13.825 5.475v6.558c0 3.345 6.2 5.648 13.825 5.648s14.072-2.303 14.072-5.648v-6.558c0-3.345-6.447-5.475-14.072-5.475"
          style={{ fill: `url(#${gradientIds.j})`, fillOpacity: 1, stroke: 'none', strokeWidth: 0.769 }}
        />
        <ellipse
          cx="24"
          cy="14.071"
          rx="12.857"
          ry="5.5"
          style={{
            fill: '#c3c3c3',
            fillOpacity: 1,
            stroke: `url(#${gradientIds.k})`,
            strokeWidth: 1.00493,
          }}
          transform="matrix(1.0373 0 0 .95462 -.895 -.076)"
        />
        <path
          d="m13.643 18 .256 5.876 4.672 1.084-.142-5.603s2.071-.04 5.428-.254c-5.216-.233-11.183-2.725-13.214-4.18 1.417 2.093 3 3.077 3 3.077"
          style={{ opacity: 0.493671, fill: `url(#${gradientIds.l})`, fillOpacity: 1, stroke: 'none', strokeWidth: 1 }}
        />
      </g>
      <g transform="matrix(8.59688 0 0 6.30047 -78.967 22.701)">
        <path
          d="M23.941 8.036c-7.625 0-13.825 2.131-13.825 5.476v6.558c0 3.345 6.2 5.648 13.825 5.648s14.072-2.303 14.072-5.648v-6.558c0-3.345-6.447-5.476-14.072-5.476"
          style={{ fill: `url(#${gradientIds.m})`, fillOpacity: 1, stroke: 'none', strokeWidth: 0.769 }}
        />
        <ellipse
          cx="24"
          cy="14.071"
          rx="12.857"
          ry="5.5"
          style={{
            fill: '#c3c3c3',
            fillOpacity: 1,
            stroke: `url(#${gradientIds.n})`,
            strokeWidth: 1.00493,
          }}
          transform="matrix(1.0373 0 0 .95462 -.895 -.076)"
        />
        <path
          d="m13.643 18 .256 5.876 4.672 1.084-.142-5.603s2.071-.04 5.428-.254c-5.216-.233-11.183-2.725-13.214-4.179 1.417 2.092 3 3.076 3 3.076"
          style={{ opacity: 0.493671, fill: `url(#${gradientIds.o})`, fillOpacity: 1, stroke: 'none', strokeWidth: 1 }}
        />
      </g>
      <g transform="matrix(8.59688 0 0 6.30047 -78.956 -40.054)">
        <path
          d="M23.941 8.037c-7.625 0-13.825 2.13-13.825 5.475v6.558c0 3.345 6.2 5.648 13.825 5.648s14.072-2.303 14.072-5.648v-6.558c0-3.345-6.447-5.475-14.072-5.475"
          style={{ fill: `url(#${gradientIds.p})`, fillOpacity: 1, stroke: 'none', strokeWidth: 0.769 }}
        />
        <ellipse
          cx="24"
          cy="14.071"
          rx="12.857"
          ry="5.5"
          style={{
            fill: '#c3c3c3',
            fillOpacity: 1,
            stroke: `url(#${gradientIds.q})`,
            strokeWidth: 1.00493,
          }}
          transform="matrix(1.0373 0 0 .95462 -.895 -.076)"
        />
        <path
          d="m13.643 18 .256 5.876 4.672 1.084-.142-5.603s2.071-.04 5.428-.255c-5.216-.233-11.183-2.724-13.214-4.178 1.417 2.093 3 3.076 3 3.076"
          style={{ opacity: 0.493671, fill: `url(#${gradientIds.r})`, fillOpacity: 1, stroke: 'none', strokeWidth: 1 }}
        />
      </g>
    </svg>
  );
}

// Official Plex logo from dashboard-icons
function PlexIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="512" height="512" fill="#282a2d" rx="15%" />
      <path fill="#e5a00d" d="M256 70H148l108 186-108 186h108l108-186z" />
    </svg>
  );
}

// Emby logo - Uses external CDN icon
function EmbyIcon({ className }: { className?: string }) {
  return (
    <img
      src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/emby.svg"
      alt="Emby"
      className={className}
    />
  );
}

// Official Docker logo from dashboard-icons
function DockerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        fill="#2496ED"
        d="M13.983 11.078h2.119a.19.19 0 0 0 .19-.192V9.297a.19.19 0 0 0-.19-.191h-2.119a.19.19 0 0 0-.19.191v1.589c0 .106.085.192.19.192m-2.954-5.43h2.118a.19.19 0 0 0 .19-.191V3.868a.19.19 0 0 0-.19-.191h-2.118a.19.19 0 0 0-.19.191v1.589c0 .106.085.191.19.191m0 2.715h2.118a.19.19 0 0 0 .19-.192V6.582a.19.19 0 0 0-.19-.19h-2.118a.19.19 0 0 0-.19.19v1.589c0 .106.085.192.19.192m-2.93 0h2.12a.19.19 0 0 0 .19-.192V6.582a.19.19 0 0 0-.19-.19H8.1a.19.19 0 0 0-.19.19v1.589c0 .106.085.192.19.192m-2.93 0h2.12a.19.19 0 0 0 .19-.192V6.582a.19.19 0 0 0-.19-.19h-2.12a.19.19 0 0 0-.19.19v1.589c0 .106.085.192.19.192m5.86 2.715h2.12a.19.19 0 0 0 .19-.192V9.297a.19.19 0 0 0-.19-.191h-2.12a.19.19 0 0 0-.19.191v1.589c0 .106.085.192.19.192m-2.93 0h2.12a.19.19 0 0 0 .19-.192V9.297a.19.19 0 0 0-.19-.191h-2.12a.19.19 0 0 0-.19.191v1.589c0 .106.085.192.19.192m-2.93 0h2.12a.19.19 0 0 0 .19-.192V9.297a.19.19 0 0 0-.19-.191h-2.12a.19.19 0 0 0-.19.191v1.589c0 .106.085.192.19.192m-2.93 0h2.12a.19.19 0 0 0 .19-.192V9.297a.19.19 0 0 0-.19-.191h-2.12a.19.19 0 0 0-.19.191v1.589c0 .106.085.192.19.192m15.825 1.578c-.473-.267-1.084-.334-1.621-.16-.166-.832-.64-1.546-1.293-1.98l-.26-.17-.185.253c-.36.492-.542 1.163-.49 1.805.028.32.11.64.256.93-.405.235-.83.396-1.24.475a5.4 5.4 0 0 1-1.49.077H.19a.19.19 0 0 0-.19.191c-.017 1.281.202 2.56.647 3.752.508 1.257 1.262 2.18 2.244 2.744 1.107.635 2.904.997 4.93.997a12.9 12.9 0 0 0 2.37-.205c1.123-.202 2.21-.59 3.223-1.145a8.8 8.8 0 0 0 2.166-1.67c1.001-1.036 1.6-2.225 2.056-3.32h.18c1.088 0 1.758-.432 2.127-.792.254-.232.445-.514.567-.83l.08-.242z"
      />
    </svg>
  );
}

// System/Server icon for system-level issues
function SystemIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} fill="none">
      <path
        stroke="#6366F1"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm0 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4ZM8 8h.01M8 18h.01"
      />
    </svg>
  );
}

// Default server icon for unknown providers
function DefaultServerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="100" height="100" rx="20" fill="#6B7280" />
      <rect x="25" y="30" width="50" height="15" rx="3" fill="white" />
      <rect x="25" y="55" width="50" height="15" rx="3" fill="white" />
      <circle cx="35" cy="37.5" r="3" fill="#6B7280" />
      <circle cx="35" cy="62.5" r="3" fill="#6B7280" />
    </svg>
  );
}

const providerIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  jellyfin: JellyfinIcon,
  emby: EmbyIcon,
  plex: PlexIcon,
  sonarr: SonarrIcon,
  radarr: RadarrIcon,
  prowlarr: ProwlarrIcon,
  lidarr: LidarrIcon,
  readarr: ReadarrIcon,
  sqlite: SQLiteIcon,
  openai: OpenAIIcon,
  anthropic: AnthropicIcon,
  google: GoogleAIIcon,
  ollama: OllamaIcon,
  lmstudio: LMStudioIcon,
  docker: DockerIcon,
  system: SystemIcon,
};

export function ProviderIcon({ providerId, className, size = 'md' }: ProviderIconProps) {
  const Icon = providerIcons[providerId.toLowerCase()] || DefaultServerIcon;
  return <Icon className={cn(sizeClasses[size], className)} />;
}

// Provider metadata for displaying names and colors
// This now pulls from the integration registry for consistency
export const providerMeta: Record<string, { name: string; color: string; bgColor: string }> = {
  jellyfin: { name: 'Jellyfin', color: '#00A4DC', bgColor: 'bg-cyan-500/10' },
  emby: { name: 'Emby', color: '#52B54B', bgColor: 'bg-green-500/10' },
  plex: { name: 'Plex', color: '#E5A00D', bgColor: 'bg-yellow-500/10' },
  sonarr: { name: 'Sonarr', color: '#00CCFF', bgColor: 'bg-sky-500/10' },
  radarr: { name: 'Radarr', color: '#FFC230', bgColor: 'bg-yellow-500/10' },
  prowlarr: { name: 'Prowlarr', color: '#E66001', bgColor: 'bg-orange-500/10' },
  lidarr: { name: 'Lidarr', color: '#00C853', bgColor: 'bg-green-500/10' },
  readarr: { name: 'Readarr', color: '#8B0000', bgColor: 'bg-red-500/10' },
  sqlite: { name: 'SQLite', color: '#003B57', bgColor: 'bg-slate-500/10' },
  openai: { name: 'OpenAI', color: '#10A37F', bgColor: 'bg-emerald-500/10' },
  anthropic: { name: 'Anthropic', color: '#D4A574', bgColor: 'bg-orange-500/10' },
  google: { name: 'Google AI', color: '#4285F4', bgColor: 'bg-blue-500/10' },
  ollama: { name: 'Ollama', color: '#7C3AED', bgColor: 'bg-violet-500/10' },
  lmstudio: { name: 'LM Studio', color: '#635BE1', bgColor: 'bg-violet-500/10' },
  docker: { name: 'Docker', color: '#2496ED', bgColor: 'bg-blue-500/10' },
  system: { name: 'System', color: '#6366F1', bgColor: 'bg-indigo-500/10' },
};

export function getProviderMeta(providerId: string) {
  // First check local providerMeta for backward compatibility
  const localMeta = providerMeta[providerId.toLowerCase()];
  if (localMeta) {
    return localMeta;
  }

  // Fall back to integration registry
  const integration = getIntegrationById(providerId.toLowerCase());
  if (integration) {
    return {
      name: integration.name,
      color: integration.color,
      bgColor: integration.bgColor,
    };
  }

  // Default fallback
  return {
    name: providerId,
    color: '#6B7280',
    bgColor: 'bg-gray-500/10',
  };
}
