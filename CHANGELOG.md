# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Pre-built Docker images published to GitHub Container Registry and Docker Hub
  - `itz4blitz/logarr-backend:latest` - Backend API image
  - `itz4blitz/logarr-frontend:latest` - Frontend UI image
- Support for multiple instances of the same server type (e.g., Movies vs Shorts, 1080p vs 4K)
  - Numbered environment variables: `RADARR_LOGS_PATH_1`, `RADARR_LOGS_PATH_2`, `RADARR_LOGS_PATH_3`
  - Container mount points: `/radarr-logs-1`, `/radarr-logs-2`, `/radarr-logs-3`
  - Works for all server types: Plex, Jellyfin, Emby, Sonarr, Radarr, Prowlarr, Whisparr
- Startup grace period for health checks
  - `HEALTH_CHECK_STARTUP_GRACE_SECONDS` environment variable (default: 60 seconds)
  - File ingestion failures treated as 'degraded' instead of 'error' during grace period
  - Prevents false health check failures during docker compose restart

### Changed

- Increased health check `start_period` from 40s to 90s in docker-compose.yml
- Whisparr log mount renamed from `/whisparr-logs` to `/whisp-logs` for consistency
- Health check response now includes `inGracePeriod` boolean field

### Fixed

- Docker compose restart no longer fails due to file ingestion health check (#26)
- Multiple arr instances can now be configured with separate log paths (#25)

### Testing

- Added health check grace period tests to `app.controller.spec.ts`
- Added multiple instances tests to `servers.service.spec.ts`
