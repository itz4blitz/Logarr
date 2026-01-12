<div align="center">

# Logarr

**Mission control for your media server stack**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Unified logging, intelligent issue detection, and AI-powered analysis for Plex, Jellyfin, Emby, Sonarr, Radarr, Prowlarr, Whisparr, and more.

[Quick Start](#quick-start) · [Features](#features) · [Screenshots](#screenshots) · [Documentation](#documentation)

</div>

---

## Why Logarr?

Running a media server stack means juggling multiple dashboards, each with their own logs and error reporting. When something breaks, you're chasing cascading failures across apps while the goalposts keep moving.

**Logarr** aggregates logs from all your servers, automatically detects and ranks issues by impact, and helps you track them to resolution—all from a single dashboard.

---

## Screenshots

<div align="center">

### Dashboard

![Dashboard](apps/frontend/public/screenshots/dashboard.png)
_Real-time overview: health status, 24-hour activity, active sessions, and top issues at a glance_

### Live Log Streaming

![Live Logs](apps/frontend/public/screenshots/logs_live.png)
_Real-time log streaming with WebSocket-based updates and instant filtering_

### Log Filtering & Search

![Filtered Logs](apps/frontend/public/screenshots/logs_filtered.png)
_Advanced filtering by level, source type (API/File), and full-text search_

### Issue Tracking

![Issues](apps/frontend/public/screenshots/issues_list.png)
_Filter by severity, status, and source. Impact scores help prioritize what matters most._

### AI-Powered Analysis

![Issue Details](apps/frontend/public/screenshots/issue_detail.png)
_Deep analysis with root cause identification, AI summaries, and 24h activity charts_

### Source Management

![Sources](apps/frontend/public/screenshots/sources.png)
_Connect and monitor all your media servers from one place_

### Source Configuration

![Source Config](apps/frontend/public/screenshots/source_config.png)
_Configure API connections and file-based log ingestion per source_

### Session Monitoring

![Sessions](apps/frontend/public/screenshots/sessions.png)
_Track active playback sessions, transcoding status, and user activity_

### AI Provider Settings

![Settings](apps/frontend/public/screenshots/settings.png)
_Configure multiple AI providers for issue analysis (Anthropic, OpenAI, Google, Ollama, LM Studio)_

</div>

---

## Features

| Category             | Capabilities                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Log Aggregation**  | Real-time streaming, full-text search, advanced filtering by server/level/source type                              |
| **File Ingestion**   | Direct container log reading, multi-line stack trace assembly, automatic rotation detection                        |
| **Issue Detection**  | Automatic error fingerprinting, deduplication, impact scoring, status tracking                                     |
| **AI Analysis**      | Root cause identification, actionable fixes, multi-provider support (Anthropic, OpenAI, Google, Ollama, LM Studio) |
| **Session Tracking** | Active playback monitoring, transcoding visibility, user attribution                                               |
| **Dashboard**        | System health, 24-hour activity timeline, top issues, now playing                                                  |

---

## Supported Servers

| Server       | Status       | Server       | Status       |
| ------------ | ------------ | ------------ | ------------ |
| **Jellyfin** | ✅ Supported | **Plex**     | ✅ Supported |
| **Sonarr**   | ✅ Supported | **Emby**     | ✅ Supported |
| **Radarr**   | ✅ Supported | **Whisparr** | ✅ Supported |
| **Prowlarr** | ✅ Supported | **Kodi**     | 🚧 Planned   |

> Logarr uses a provider architecture—adding support for new servers is straightforward. [Contributions welcome!](#contributing)

---

## Quick Start

### Using Pre-built Images (Quickest)

Logarr publishes pre-built Docker images to both **GitHub Container Registry** and **Docker Hub**:

```bash
# Create docker-compose.yml with:
services:
  backend:
    image: itz4blitz/logarr-backend:latest
    # ... rest of configuration
  frontend:
    image: itz4blitz/logarr-frontend:latest
    # ... rest of configuration
```

See the full [`docker-compose.yml`](docker-compose.yml) for complete configuration.

### Docker Compose (Recommended)

```bash
git clone https://github.com/itz4blitz/logarr.git
cd logarr
cp .env.example .env
docker compose up -d
```

Open `http://localhost:3001` and add your first server.

### Development

```bash
pnpm install
pnpm docker:dev      # Start PostgreSQL & Redis
pnpm db:push         # Initialize database
pnpm dev             # Start dev servers
```

- **Frontend:** http://localhost:3001
- **API:** http://localhost:4001/api
- **Docs:** http://localhost:4001/api/docs

---

## Architecture

```mermaid
flowchart TB
    subgraph Client
        FE[Next.js Frontend]
    end

    subgraph Backend
        API[NestJS API]
        WS[WebSocket Server]
    end

    subgraph Data
        PG[(PostgreSQL)]
        RD[(Redis)]
    end

    subgraph Providers
        PX[Plex]
        JF[Jellyfin]
        EM[Emby]
        SO[Sonarr]
        RA[Radarr]
        PR[Prowlarr]
        WH[Whisparr]
    end

    FE <--> API
    FE <--> WS
    API <--> PG
    API <--> RD
    API <--> PX & JF & EM & SO & RA & PR & WH
```

### How It Works

**Log Ingestion** — Providers connect via WebSocket or polling (configurable per server). Logs are deduplicated using external activity IDs.

**Error Fingerprinting** — Similar errors are normalized and hashed to group thousands of occurrences into single trackable issues.

**Impact Scoring** — Each issue receives a 0-100 score based on severity (40%), frequency (25%), affected users (20%), sessions (10%), and recency (5%).

---

## Configuration

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/logarr
REDIS_URL=redis://localhost:6380

# Optional - AI Analysis (auto-configured on startup if set)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...

# Optional - Local AI
OLLAMA_BASE_URL=http://localhost:11434
LMSTUDIO_BASE_URL=http://localhost:1234/v1

# Optional - Media Servers (auto-configured on startup if set)
JELLYFIN_URL=http://jellyfin:8096
JELLYFIN_API_KEY=...
PLEX_URL=http://plex:32400
PLEX_TOKEN=...

# Optional - Data Retention (defaults shown)
LOG_RETENTION_DAYS=30           # Days to keep info/debug logs
LOG_RETENTION_ERROR_DAYS=90     # Days to keep error/warn logs
LOG_CLEANUP_ENABLED=true        # Enable automatic cleanup
LOG_CLEANUP_CRON=0 3 * * *      # Cleanup schedule (default: 3 AM daily)
```

### Data Retention

Logarr automatically cleans up old logs to prevent unbounded database growth—essential for home servers with limited storage.

| Setting          | Default    | Description                       |
| ---------------- | ---------- | --------------------------------- |
| Info/Debug logs  | 30 days    | Lower-priority logs cleaned first |
| Error/Warn logs  | 90 days    | Kept 3x longer for debugging      |
| Cleanup schedule | 3 AM daily | Configurable via cron expression  |

**Configuration options:**

- **Environment variables** — Set defaults in `docker-compose.yml` or `.env`
- **Settings UI** — Adjust at runtime via **Settings → Data Management**

Issues and statistics are preserved even after logs are deleted. The Data Management page shows storage usage, cleanup history, and lets you preview or trigger manual cleanup.

### Adding Servers

1. Navigate to **Sources** → **Add Source**
2. Select server type and enter URL + API key
3. Test connection and save

Alternatively, set environment variables (e.g., `JELLYFIN_URL` and `JELLYFIN_API_KEY`) and servers will be auto-configured on startup.

### File-Based Log Ingestion

For deeper log analysis, Logarr can read log files directly from your media servers. This captures detailed application logs that APIs don't expose.

#### Setup (Docker)

1. **Set log paths in `.env`** — Point to your host machine's log directories:

```bash
# Media Servers
PLEX_LOGS_PATH=/path/to/plex/Library/Application Support/Plex Media Server/Logs
JELLYFIN_LOGS_PATH=/path/to/jellyfin/config/log
EMBY_LOGS_PATH=/path/to/emby/config/logs

# *arr Apps
SONARR_LOGS_PATH=/path/to/sonarr/config/logs
RADARR_LOGS_PATH=/path/to/radarr/config/logs
PROWLARR_LOGS_PATH=/path/to/prowlarr/config/logs
WHISPARR_LOGS_PATH=/path/to/whisparr/config/logs
```

2. **Restart Logarr** — The docker-compose mounts these paths automatically.

3. **Configure in UI** — Go to **Sources** → Edit your server → Enable file ingestion with the container path:

| Server   | Container Path   |
| -------- | ---------------- |
| Plex     | `/plex-logs`     |
| Jellyfin | `/jellyfin-logs` |
| Emby     | `/emby-logs`     |
| Sonarr   | `/sonarr-logs`   |
| Radarr   | `/radarr-logs`   |
| Prowlarr | `/prowlarr-logs` |
| Whisparr | `/whisp-logs`    |

#### Multiple Instances (e.g., Movies vs Shorts, 1080p vs 4K)

To run multiple instances of the same server type, use numbered environment variables:

```bash
# Primary Radarr instance (for Movies)
RADARR_URL=http://radarr-movies:7878
RADARR_API_KEY=your_api_key
RADARR_LOGS_PATH=/path/to/radarr-movies/logs

# Secondary Radarr instance (for Shorts)
RADARR_LOGS_PATH_1=/path/to/radarr-shorts/logs
RADARR_LOGS_PATH_2=/path/to/radarr-4k/logs
```

The numbered instances are mounted as:

- `/radarr-logs-1`
- `/radarr-logs-2`
- `/radarr-logs-3`

Simply add multiple servers in the UI using the same server type but different URLs and log paths.

| Instance   | Container Path   |
| ---------- | ---------------- |
| Primary    | `/radarr-logs`   |
| Instance 1 | `/radarr-logs-1` |
| Instance 2 | `/radarr-logs-2` |
| Instance 3 | `/radarr-logs-3` |

> **Note**: You can have up to 3 additional instances per server type beyond the primary. Add each instance as a separate server in the Sources UI.

#### Common Log Locations

| Server   | Docker                     | Linux                               | Windows                                 |
| -------- | -------------------------- | ----------------------------------- | --------------------------------------- |
| Plex     | `/config/Library/.../Logs` | `/var/lib/plexmediaserver/.../Logs` | `%LOCALAPPDATA%\Plex Media Server\Logs` |
| Jellyfin | `/config/log`              | `/var/lib/jellyfin/log`             | `C:\ProgramData\Jellyfin\Server\log`    |
| Emby     | `/config/logs`             | `/var/lib/emby/logs`                | `C:\ProgramData\Emby-Server\logs`       |
| Sonarr   | `/config/logs`             | `~/.config/Sonarr/logs`             | `C:\ProgramData\Sonarr\logs`            |
| Radarr   | `/config/logs`             | `~/.config/Radarr/logs`             | `C:\ProgramData\Radarr\logs`            |
| Prowlarr | `/config/logs`             | `~/.config/Prowlarr/logs`           | `C:\ProgramData\Prowlarr\logs`          |
| Whisparr | `/config/logs`             | `~/.config/Whisparr/logs`           | `C:\ProgramData\Whisparr\logs`          |

---

## API Reference

Once running, Swagger docs are available at `http://localhost:4001/api/docs`.

| Endpoint            | Description                      |
| ------------------- | -------------------------------- |
| `GET /api/logs`     | Search and filter logs           |
| `GET /api/issues`   | Issue management and AI analysis |
| `GET /api/sessions` | Active and historical sessions   |
| `GET /api/servers`  | Server management                |

### WebSocket Events

```javascript
// Connect to ws://localhost:4001/logs
socket.on('log', (log) => {}); // New log entry
socket.on('issue.created', (issue) => {}); // New issue detected
socket.on('session.started', (session) => {}); // Playback started
```

---

## Project Structure

```
logarr/
├── apps/
│   ├── backend/            # NestJS API
│   └── frontend/           # Next.js app
├── packages/
│   ├── core/               # Shared types and utilities
│   ├── provider-plex/      # Plex integration
│   ├── provider-jellyfin/  # Jellyfin integration
│   ├── provider-emby/      # Emby integration
│   ├── provider-sonarr/    # Sonarr integration
│   ├── provider-radarr/    # Radarr integration
│   ├── provider-prowlarr/  # Prowlarr integration
│   ├── provider-whisparr/  # Whisparr integration
│   └── provider-arr/       # Base *arr provider
└── docker-compose.yml
```

---

## Contributing

```bash
git checkout -b feature/your-feature
# Make changes
git commit -m 'Add your feature'
git push origin feature/your-feature
# Open a Pull Request
```

Guidelines: TypeScript strict mode, ESLint + Prettier, tests for new features.

---

## Testing

Logarr has comprehensive test coverage using [Vitest](https://vitest.dev/).

### Running Tests

```bash
pnpm test              # Run all tests
pnpm test:coverage     # Run with coverage report
pnpm test:e2e          # Run Playwright E2E tests
```

### Test Packages

| Package                     | Description                            |
| --------------------------- | -------------------------------------- |
| `@logarr/backend`           | Backend services and controllers       |
| `frontend`                  | React components, hooks, and utilities |
| `@logarr/core`              | Core HTTP utilities                    |
| `@logarr/provider-arr`      | \*arr application log parser           |
| `@logarr/provider-emby`     | Emby log parser                        |
| `@logarr/provider-whisparr` | Whisparr provider                      |

> Coverage thresholds are enforced at 80% for statements, branches, functions, and lines.

---

## Roadmap

This project is under active development. Check out our [GitHub Discussions](https://github.com/itz4blitz/logarr/discussions) for feature requests, ideas, and community conversations.

---

## License

MIT — see [LICENSE](LICENSE) for details.

<div align="center">

**[Report Bug](https://github.com/itz4blitz/logarr/issues) · [Request Feature](https://github.com/itz4blitz/logarr/issues)**

</div>
