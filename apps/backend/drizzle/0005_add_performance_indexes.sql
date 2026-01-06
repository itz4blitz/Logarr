-- Performance indexes to optimize common query patterns
-- These composite indexes will dramatically speed up filtered searches

-- =================================================================
-- LOG_ENTRIES COMPOSITE INDEXES
-- =================================================================

-- Most common query: logs for a specific server within a time range
-- Used by: dashboard, log viewer, session details
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_log_entries_server_timestamp
  ON log_entries(server_id, timestamp DESC);

-- Filter logs by server + level (e.g., "show me errors for this server")
-- Used by: log filtering, dashboard error counts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_log_entries_server_level
  ON log_entries(server_id, level);

-- Time-based queries with level filter (e.g., "errors in last 24h")
-- Used by: dashboard aggregations, health checks
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_log_entries_level_timestamp
  ON log_entries(level, timestamp DESC);

-- =================================================================
-- ISSUES COMPOSITE INDEXES
-- =================================================================

-- Filter issues by status + severity (dashboard "critical open issues")
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issues_status_severity
  ON issues(status, severity);

-- Server-specific issue filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issues_server_status
  ON issues(server_id, status);

-- Recent issues sorted by impact (for "top issues" widget)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issues_status_impact
  ON issues(status, impact_score DESC)
  WHERE status IN ('open', 'acknowledged', 'in_progress');

-- =================================================================
-- ISSUE_OCCURRENCES COMPOSITE INDEXES
-- =================================================================

-- Fast lookup of occurrences for an issue sorted by time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issue_occurrences_issue_timestamp
  ON issue_occurrences(issue_id, timestamp DESC);

-- =================================================================
-- PLAYBACK_EVENTS COMPOSITE INDEXES
-- =================================================================

-- Session events sorted by time (for timeline views)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_playback_events_session_timestamp
  ON playback_events(session_id, timestamp DESC);

-- =================================================================
-- SESSIONS COMPOSITE INDEXES
-- =================================================================

-- Active sessions for a server (now playing widget)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_server_active
  ON sessions(server_id, is_active)
  WHERE is_active = true;
