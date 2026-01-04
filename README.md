<div align="center">

# Logarr

**Mission control for your media server stack**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Unified logging, intelligent issue detection, and AI-powered analysis for Jellyfin, Sonarr, Radarr, Prowlarr, and more.

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
_Configure multiple AI providers for issue analysis (Anthropic, OpenAI, Google, Ollama)_

</div>

---

## Features

| Category             | Capabilities                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| **Log Aggregation**  | Real-time streaming, full-text search, advanced filtering by server/level/source type          |
| **File Ingestion**   | Direct container log reading, multi-line stack trace assembly, automatic rotation detection    |
| **Issue Detection**  | Automatic error fingerprinting, deduplication, impact scoring, status tracking                 |
| **AI Analysis**      | Root cause identification, actionable fixes, multi-provider support (Anthropic, OpenAI, Google)|
| **Session Tracking** | Active playback monitoring, transcoding visibility, user attribution                           |
| **Dashboard**        | System health, 24-hour activity timeline, top issues, now playing                              |

---

## Supported Servers

| Server       | Status       | Server   | Status     |
| ------------ | ------------ | -------- | ---------- |
| **Jellyfin** | ✅ Supported | **Plex** | 🚧 Planned |
| **Sonarr**   | ✅ Supported | **Emby** | 🚧 Planned |
| **Radarr**   | ✅ Supported | **Kodi** | 🚧 Planned |
| **Prowlarr** | ✅ Supported |          |            |

> Logarr uses a provider architecture—adding support for new servers is straightforward. [Contributions welcome!](#contributing)

---

## Quick Start

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
        JF[Jellyfin]
        SO[Sonarr]
        RA[Radarr]
        PR[Prowlarr]
    end

    FE <--> API
    FE <--> WS
    API <--> PG
    API <--> RD
    API <--> JF & SO & RA & PR
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

# Optional - AI Analysis
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
```

### Adding Servers

1. Navigate to **Sources** → **Add Source**
2. Select server type and enter URL + API key
3. Test connection and save

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
socket.on('log', (log) => {});           // New log entry
socket.on('issue.created', (issue) => {}); // New issue detected
socket.on('session.started', (session) => {}); // Playback started
```

---

## Project Structure

```
logarr/
├── apps/
│   ├── backend/           # NestJS API
│   └── frontend/          # Next.js app
├── packages/
│   ├── core/              # Shared types
│   ├── provider-jellyfin/ # Jellyfin integration
│   ├── provider-sonarr/   # Sonarr integration
│   ├── provider-radarr/   # Radarr integration
│   ├── provider-prowlarr/ # Prowlarr integration
│   └── provider-arr/      # Base *arr provider
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

| Package | Tests | Coverage |
|---------|-------|----------|
| **Backend** | 249 | 89.57% lines |
| **Frontend** | 54 | 100% lines |

### Running Tests

```bash
pnpm test              # Run all tests
pnpm test:coverage     # Run with coverage report
pnpm test:e2e          # Run Playwright E2E tests
```

### Coverage by Module (Backend)

| Module | Statements | Branches | Functions | Lines |
|--------|------------|----------|-----------|-------|
| logs.service | 100% | 98% | 100% | 100% |
| sessions.service | 100% | 92% | 100% | 100% |
| settings.service | 100% | 100% | 100% | 100% |
| dashboard.service | 98% | 95% | 100% | 99% |
| servers.service | 87% | 78% | 87% | 88% |
| issues.service | 79% | 80% | 74% | 82% |

> Coverage thresholds are enforced at 80% for statements, branches, functions, and lines.

---

## Roadmap

This project is under active development and we're looking for contributors to help shape its direction.

Some ideas on the table:

- Additional providers (Plex, Emby, Kodi)
- Alerting integrations (Slack, Discord, email)
- Log retention policies
- Custom dashboards

Have other ideas? [Open an issue](https://github.com/itz4blitz/logarr/issues) or jump into a discussion.

---

## License

MIT — see [LICENSE](LICENSE) for details.

<div align="center">

**[Report Bug](https://github.com/itz4blitz/logarr/issues) · [Request Feature](https://github.com/itz4blitz/logarr/issues)**

</div>
