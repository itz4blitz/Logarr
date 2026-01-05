# Plex Session Display Issues - Research & Plan

## Current Issues

1. **No progress bar** for Plex sessions in the Now Playing card
2. **No artwork/thumbnail** for Plex sessions
3. **404 on `/api/servers/test-all`** - Backend needs restart
4. **Hydration mismatch warning** - Radix UI aria-controls ID mismatch (cosmetic, not blocking)

## Root Cause Analysis

### Data Flow

```
Plex API (/status/sessions)
    ↓
PlexProvider.getSessions() → normalizeSession()
    ↓
IngestionService.pollAllSessions() → syncSessions()
    ↓
Database: sessions + playbackEvents tables
    ↓
SessionsService.getActiveSessions() → enrichSessionsWithPlayback()
    ↓
Frontend: SessionCard component
```

### Key Fields Required for Progress/Artwork

| Frontend Field  | Backend DTO                 | Playback Event  | Plex Provider                | Plex API          |
| --------------- | --------------------------- | --------------- | ---------------------------- | ----------------- |
| `runTimeTicks`  | `durationTicks?.toString()` | `durationTicks` | `session.duration * 10000`   | `duration` (ms)   |
| `positionTicks` | `positionTicks?.toString()` | `positionTicks` | `session.viewOffset * 10000` | `viewOffset` (ms) |
| `thumbnailUrl`  | `thumbnailUrl`              | `thumbnailUrl`  | Built from `session.thumb`   | `thumb` path      |

### Verified Working Components

- ✅ Plex provider `normalizeSession()` correctly maps `duration` → `durationTicks`
- ✅ Plex provider builds `thumbnailUrl` from `thumb` path with token
- ✅ Backend `syncSessions()` stores `durationTicks` and `thumbnailUrl` in playbackEvents
- ✅ Backend `enrichSessionsWithPlayback()` retrieves latest event and maps to DTO
- ✅ Frontend `SessionCard` uses `nowPlaying.runTimeTicks` and `nowPlaying.thumbnailUrl`

### Likely Issues

1. **Backend not restarted** - New session polling code not running
2. **No playback events exist yet** - Need initial poll to create them
3. **Debug logging** - Added but backend needs restart to see output

## Verification Steps

After restarting the backend, check:

1. **Backend logs** - Look for:

   ```
   Session poll: X sessions from [Plex Server Name]
   Plex session: [user] playing "[title]" - duration: [ticks], thumb: yes/no
   Inserting playback event for session [id]: [title], duration=[ticks], thumb=yes/no
   ```

2. **Database** - Check if playback events exist:

   ```sql
   SELECT pe.session_id, pe.item_name, pe.duration_ticks, pe.thumbnail_url
   FROM playback_events pe
   JOIN sessions s ON s.id = pe.session_id
   WHERE s.server_id = '[plex-server-id]'
   ORDER BY pe.timestamp DESC
   LIMIT 10;
   ```

3. **API Response** - Call `GET /api/sessions/active` and verify `nowPlaying` object has:
   - `runTimeTicks` (should be a string like "81600000000" for a 2hr 16min movie)
   - `thumbnailUrl` (should be full URL with token)

## Windows Plex Logs Access

The user has Plex on Windows PC (192.168.1.62) and Docker on Unraid (different network).

### Options to Access Windows Plex Logs from Docker:

1. **Network Share (SMB)**
   - Share `C:\Users\gollum\AppData\Local\Plex Media Server\Logs` as a Windows share
   - Mount the SMB share in the Docker container:
     ```yaml
     volumes:
       - //192.168.1.62/PlexLogs:/plex-logs:ro
     ```
   - Or use CIFS mount on Unraid host first

2. **Disable File Ingestion for Plex**
   - Since Plex is on a different machine, file-based log ingestion won't work
   - The Plex provider still works via API (sessions, history, etc.)
   - Edit the Plex source in the UI and disable "File Ingestion"

3. **Move Plex to Unraid (recommended long-term)**
   - Run Plex as a Docker container on Unraid
   - All logs would be accessible locally

### Recommended Approach

For now, **disable file ingestion** for the Plex source since the API connection is working. The session tracking, history, and WebSocket notifications all work without file logs.

## Source Debugging Improvements (Future)

### Current State

- Basic error messages shown via toast
- Per-path validation for file ingestion
- Server info on successful connections

### Proposed Improvements

1. **Expanded error details in test results**
   - Network-level diagnostics (timeout, DNS, connectivity)
   - Authentication error specifics (invalid vs expired)
   - Filesystem details (permissions, mount info)

2. **Debug panel in Sources page**
   - Expandable error details per source
   - Connection history/timeline
   - Raw API response viewer for debugging

3. **Proactive health checks**
   - Background connection monitoring
   - Alerts when sources go offline
   - Automatic retry with backoff

## Immediate Action Items

1. **Restart the backend** to pick up new code:

   ```bash
   # Stop current backend
   docker-compose -f docker-compose.dev.yml down backend

   # Rebuild and start
   docker-compose -f docker-compose.dev.yml up --build backend
   ```

2. **Verify Plex sessions are being polled** - Check backend logs

3. **Disable file ingestion for Plex** - Since it's on a different machine

4. **Monitor for progress/artwork** - Should appear after backend restart and initial poll
