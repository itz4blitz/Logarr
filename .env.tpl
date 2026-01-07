# 1Password Secret Template for Logarr (OPTIONAL)
# This file is for developers using 1Password CLI for secret management.
# Regular users should copy .env.example to .env and fill in values manually.
#
# Usage: op inject -i .env.tpl -o .env

# =============================================================================
# Environment
# =============================================================================
NODE_ENV=development

# =============================================================================
# Database & Redis
# =============================================================================
DATABASE_URL={{ op://Development/Logarr-Dev/DATABASE_URL }}
REDIS_URL={{ op://Development/Logarr-Dev/REDIS_URL }}

# =============================================================================
# Backend
# =============================================================================
BACKEND_PORT={{ op://Development/Logarr-Dev/BACKEND_PORT }}
CORS_ORIGIN={{ op://Development/Logarr-Dev/CORS_ORIGIN }}

# =============================================================================
# Frontend
# =============================================================================
NEXT_PUBLIC_API_URL={{ op://Development/Logarr-Dev/NEXT_PUBLIC_API_URL }}
NEXT_PUBLIC_WS_URL={{ op://Development/Logarr-Dev/NEXT_PUBLIC_WS_URL }}
FRONTEND_PORT={{ op://Development/Logarr-Dev/FRONTEND_PORT }}

# =============================================================================
# AI Providers (optional - auto-configured on startup)
# =============================================================================
ANTHROPIC_API_KEY={{ op://Development/Logarr-Dev/ANTHROPIC_API_KEY }}
OPENAI_API_KEY={{ op://Development/Logarr-Dev/OPENAI_API_KEY }}
GOOGLE_AI_API_KEY={{ op://Development/Logarr-Dev/GOOGLE_AI_API_KEY }}
# OLLAMA_BASE_URL={{ op://Development/Logarr-Dev/OLLAMA_BASE_URL }}
# LMSTUDIO_BASE_URL={{ op://Development/Logarr-Dev/LMSTUDIO_BASE_URL }}

# =============================================================================
# Historical Log Backfill (default: true)
# Set to false to skip historical log processing - only capture new entries
# =============================================================================
BACKFILL=true

# =============================================================================
# Log Retention (optional)
# =============================================================================
LOG_CLEANUP_ENABLED={{ op://Development/Logarr-Dev/LOG_CLEANUP_ENABLED }}
LOG_RETENTION_DAYS={{ op://Development/Logarr-Dev/LOG_RETENTION_DAYS }}
LOG_RETENTION_ERROR_DAYS={{ op://Development/Logarr-Dev/LOG_RETENTION_ERROR_DAYS }}
LOG_CLEANUP_CRON={{ op://Development/Logarr-Dev/LOG_CLEANUP_CRON }}
LOG_CLEANUP_BATCH_SIZE={{ op://Development/Logarr-Dev/LOG_CLEANUP_BATCH_SIZE }}

# =============================================================================
# MEDIA SERVERS (optional - auto-configured on startup)
# =============================================================================

# Jellyfin
JELLYFIN_URL={{ op://Development/Logarr-Dev/JELLYFIN_URL }}
JELLYFIN_API_KEY={{ op://Development/Logarr-Dev/JELLYFIN_API_KEY }}

# Plex (use X-Plex-Token)
PLEX_URL={{ op://Development/Logarr-Dev/PLEX_URL }}
PLEX_TOKEN={{ op://Development/Logarr-Dev/PLEX_TOKEN }}

# Emby
EMBY_URL={{ op://Development/Logarr-Dev/EMBY_URL }}
EMBY_API_KEY={{ op://Development/Logarr-Dev/EMBY_API_KEY }}

# Sonarr
SONARR_URL={{ op://Development/Logarr-Dev/SONARR_URL }}
SONARR_API_KEY={{ op://Development/Logarr-Dev/SONARR_API_KEY }}

# Radarr
RADARR_URL={{ op://Development/Logarr-Dev/RADARR_URL }}
RADARR_API_KEY={{ op://Development/Logarr-Dev/RADARR_API_KEY }}

# Prowlarr
PROWLARR_URL={{ op://Development/Logarr-Dev/PROWLARR_URL }}
PROWLARR_API_KEY={{ op://Development/Logarr-Dev/PROWLARR_API_KEY }}

# Whisparr
WHISPARR_URL={{ op://Development/Logarr-Dev/WHISPARR_URL }}
WHISPARR_API_KEY={{ op://Development/Logarr-Dev/WHISPARR_API_KEY }}

# =============================================================================
# LOG FILE PATHS (optional - for file-based log ingestion)
# These are HOST paths used in development (native) mode.
# In Docker, these get mounted to container paths like /jellyfin-logs
# =============================================================================
JELLYFIN_LOGS_PATH={{ op://Development/Logarr-Dev/JELLYFIN_LOGS_PATH }}
PLEX_LOGS_PATH={{ op://Development/Logarr-Dev/PLEX_LOGS_PATH }}
EMBY_LOGS_PATH={{ op://Development/Logarr-Dev/EMBY_LOGS_PATH }}
SONARR_LOGS_PATH={{ op://Development/Logarr-Dev/SONARR_LOGS_PATH }}
RADARR_LOGS_PATH={{ op://Development/Logarr-Dev/RADARR_LOGS_PATH }}
PROWLARR_LOGS_PATH={{ op://Development/Logarr-Dev/PROWLARR_LOGS_PATH }}
WHISPARR_LOGS_PATH={{ op://Development/Logarr-Dev/WHISPARR_LOGS_PATH }}
