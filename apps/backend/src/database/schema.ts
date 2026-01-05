import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  uuid,
  index,
  jsonb,
  uniqueIndex,
  pgEnum,
  real,
} from 'drizzle-orm/pg-core';

// Enums for Issues system
export const issueStatusEnum = pgEnum('issue_status', [
  'open',
  'acknowledged',
  'in_progress',
  'resolved',
  'ignored',
]);
export const issueSeverityEnum = pgEnum('issue_severity', [
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);
export const issueSourceEnum = pgEnum('issue_source', [
  'jellyfin',
  'sonarr',
  'radarr',
  'prowlarr',
  'docker',
  'system',
]);

// Enum for log source tracking
export const logSourceEnum = pgEnum('log_source', ['api', 'file']);

/**
 * Servers table - stores connected media servers
 */
export const servers = pgTable(
  'servers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    providerId: text('provider_id').notNull(),
    url: text('url').notNull(),
    apiKey: text('api_key').notNull(),
    logPath: text('log_path'),
    isEnabled: boolean('is_enabled').notNull().default(true),
    isConnected: boolean('is_connected').notNull().default(false),
    lastSeen: timestamp('last_seen', { withTimezone: true }),
    lastError: text('last_error'),
    version: text('version'),
    serverName: text('server_name'),
    // Track the last synced activity timestamp for incremental polling
    lastActivitySync: timestamp('last_activity_sync', { withTimezone: true }),
    // File-based log ingestion settings
    fileIngestionEnabled: boolean('file_ingestion_enabled').notNull().default(false),
    fileIngestionConnected: boolean('file_ingestion_connected').notNull().default(false),
    fileIngestionError: text('file_ingestion_error'),
    logPaths: text('log_paths').array(), // Multiple log paths
    logFilePatterns: text('log_file_patterns').array(), // e.g., ['log_*.log', '*.txt']
    lastFileSync: timestamp('last_file_sync', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('servers_provider_id_idx').on(table.providerId),
    index('servers_is_enabled_idx').on(table.isEnabled),
  ]
);

/**
 * Log entries table - stores parsed log entries
 */
export const logEntries = pgTable(
  'log_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    // Unique external ID from the source system (e.g., Jellyfin activity ID)
    // Used for idempotent ingestion - prevents duplicates
    externalActivityId: text('external_activity_id'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    level: text('level').notNull(),
    message: text('message').notNull(),
    source: text('source'),
    threadId: text('thread_id'),
    raw: text('raw').notNull(),
    sessionId: text('session_id'),
    userId: text('user_id'),
    deviceId: text('device_id'),
    itemId: text('item_id'),
    playSessionId: text('play_session_id'),
    metadata: jsonb('metadata'),
    exception: text('exception'),
    stackTrace: text('stack_trace'),
    searchVector: text('search_vector'),
    // File-based log ingestion fields
    logSource: logSourceEnum('log_source').notNull().default('api'), // 'api' | 'file'
    logFilePath: text('log_file_path'), // Source file path for file-based logs
    logFileLine: integer('log_file_line'), // Line number in source file
    deduplicationKey: text('deduplication_key'), // Hash for deduplication across sources
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('log_entries_server_id_idx').on(table.serverId),
    index('log_entries_timestamp_idx').on(table.timestamp),
    index('log_entries_level_idx').on(table.level),
    index('log_entries_source_idx').on(table.source),
    index('log_entries_session_id_idx').on(table.sessionId),
    index('log_entries_user_id_idx').on(table.userId),
    index('log_entries_play_session_id_idx').on(table.playSessionId),
    index('log_entries_log_source_idx').on(table.logSource),
    // Unique constraint for deduplication - one activity per server
    uniqueIndex('log_entries_server_external_id_idx').on(table.serverId, table.externalActivityId),
    // Unique constraint for cross-source deduplication
    uniqueIndex('log_entries_server_dedup_key_idx').on(table.serverId, table.deduplicationKey),
  ]
);

/**
 * Log file state table - tracks read positions for file-based log ingestion
 * Enables resumable tailing and rotation detection
 */
export const logFileState = pgTable(
  'log_file_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    // Relative path within the log directory (for portability)
    filePath: text('file_path').notNull(),
    // Absolute path on the system (for actual file access)
    absolutePath: text('absolute_path').notNull(),
    // Last known file size (for detecting truncation/rotation)
    fileSize: bigint('file_size', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    // Last read byte position
    byteOffset: bigint('byte_offset', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    // Last line number processed (for display/debugging)
    lineNumber: integer('line_number').notNull().default(0),
    // File inode (Unix) or file ID (Windows) for rotation detection
    fileInode: text('file_inode'),
    // Last modification time of file
    fileModifiedAt: timestamp('file_modified_at', { withTimezone: true }),
    // Last time we successfully read from this file
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    // Is this file actively being tailed?
    isActive: boolean('is_active').notNull().default(true),
    // Error message if file is inaccessible
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One entry per file per server
    uniqueIndex('log_file_state_server_file_idx').on(table.serverId, table.filePath),
    index('log_file_state_server_id_idx').on(table.serverId),
    index('log_file_state_is_active_idx').on(table.isActive),
  ]
);

/**
 * Sessions table - tracks playback sessions
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    playSessionId: text('play_session_id'),
    userId: text('user_id'),
    userName: text('user_name'),
    deviceId: text('device_id').notNull(),
    deviceName: text('device_name'),
    clientName: text('client_name'),
    clientVersion: text('client_version'),
    ipAddress: text('ip_address'),
    nowPlayingItemId: text('now_playing_item_id'),
    nowPlayingItemName: text('now_playing_item_name'),
    nowPlayingItemType: text('now_playing_item_type'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    lastActivity: timestamp('last_activity', { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_server_id_idx').on(table.serverId),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_device_id_idx').on(table.deviceId),
    index('sessions_is_active_idx').on(table.isActive),
    // Unique constraint to prevent duplicate sessions from race conditions
    uniqueIndex('sessions_server_external_id_idx').on(table.serverId, table.externalId),
  ]
);

/**
 * Playback events table - tracks media playback events
 */
export const playbackEvents = pgTable(
  'playback_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    itemId: text('item_id'),
    itemName: text('item_name'),
    itemType: text('item_type'),
    positionTicks: bigint('position_ticks', { mode: 'bigint' }),
    durationTicks: bigint('duration_ticks', { mode: 'bigint' }),
    isPaused: boolean('is_paused').notNull().default(false),
    isMuted: boolean('is_muted').notNull().default(false),
    isTranscoding: boolean('is_transcoding').notNull().default(false),
    transcodeReasons: text('transcode_reasons').array(),
    videoCodec: text('video_codec'),
    audioCodec: text('audio_codec'),
    container: text('container'),
    thumbnailUrl: text('thumbnail_url'),
    seriesName: text('series_name'),
    seasonName: text('season_name'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('playback_events_session_id_idx').on(table.sessionId),
    index('playback_events_timestamp_idx').on(table.timestamp),
    index('playback_events_event_type_idx').on(table.eventType),
  ]
);

/**
 * AI analysis results table
 */
export const aiAnalyses = pgTable(
  'ai_analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'cascade' }),
    logEntryId: uuid('log_entry_id').references(() => logEntries.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    prompt: text('prompt').notNull(),
    response: text('response').notNull(),
    tokensUsed: integer('tokens_used'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ai_analyses_server_id_idx').on(table.serverId),
    index('ai_analyses_log_entry_id_idx').on(table.logEntryId),
    index('ai_analyses_session_id_idx').on(table.sessionId),
  ]
);

/**
 * Issues table - correlates multiple log errors into discrete actionable issues
 * The key insight: 400 errors might represent only 8 actual problems
 */
export const issues = pgTable(
  'issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Fingerprint is a hash of the normalized error pattern for deduplication
    fingerprint: text('fingerprint').notNull().unique(),
    // Human-readable title (auto-generated or user-edited)
    title: text('title').notNull(),
    // Detailed description of the issue
    description: text('description'),
    // Source system (jellyfin, sonarr, docker, etc.)
    source: issueSourceEnum('source').notNull(),
    // Severity level for prioritization
    severity: issueSeverityEnum('severity').notNull().default('medium'),
    // Current status
    status: issueStatusEnum('status').notNull().default('open'),
    // Server this issue is primarily associated with (null = cross-server)
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'set null' }),
    // Category for grouping (e.g., "playback", "transcoding", "network", "auth", "database")
    category: text('category'),
    // The original error message pattern (for matching new occurrences)
    errorPattern: text('error_pattern').notNull(),
    // Sample error message (first occurrence)
    sampleMessage: text('sample_message').notNull(),
    // Exception type if applicable
    exceptionType: text('exception_type'),
    // First and last occurrence timestamps
    firstSeen: timestamp('first_seen', { withTimezone: true }).notNull(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull(),
    // Occurrence count (denormalized for performance)
    occurrenceCount: integer('occurrence_count').notNull().default(1),
    // Affected users count (denormalized)
    affectedUsersCount: integer('affected_users_count').notNull().default(0),
    // Affected sessions count (denormalized)
    affectedSessionsCount: integer('affected_sessions_count').notNull().default(0),
    // Impact score (0-100) calculated from frequency, severity, affected users
    impactScore: real('impact_score').notNull().default(0),
    // AI-generated analysis (when user requests it)
    aiAnalysis: text('ai_analysis'),
    aiAnalysisAt: timestamp('ai_analysis_at', { withTimezone: true }),
    // AI-suggested fix
    aiSuggestedFix: text('ai_suggested_fix'),
    // Related external resources (docs, github issues, etc.)
    relatedLinks: jsonb('related_links').$type<Array<{ title: string; url: string }>>(),
    // User notes
    notes: text('notes'),
    // Who acknowledged/resolved this issue
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    // Metadata for extensibility
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('issues_fingerprint_idx').on(table.fingerprint),
    index('issues_server_id_idx').on(table.serverId),
    index('issues_source_idx').on(table.source),
    index('issues_severity_idx').on(table.severity),
    index('issues_status_idx').on(table.status),
    index('issues_category_idx').on(table.category),
    index('issues_last_seen_idx').on(table.lastSeen),
    index('issues_impact_score_idx').on(table.impactScore),
    index('issues_occurrence_count_idx').on(table.occurrenceCount),
  ]
);

/**
 * Issue occurrences - links issues to individual log entries
 * This allows us to see all the specific errors that make up an issue
 */
export const issueOccurrences = pgTable(
  'issue_occurrences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    logEntryId: uuid('log_entry_id')
      .notNull()
      .references(() => logEntries.id, { onDelete: 'cascade' }),
    // Denormalized fields for quick display without joins
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'cascade' }),
    userId: text('user_id'),
    sessionId: text('session_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('issue_occurrences_issue_id_idx').on(table.issueId),
    index('issue_occurrences_log_entry_id_idx').on(table.logEntryId),
    index('issue_occurrences_timestamp_idx').on(table.timestamp),
    uniqueIndex('issue_occurrences_issue_log_idx').on(table.issueId, table.logEntryId),
  ]
);

/**
 * Issue patterns - stores patterns for automatic issue detection
 * Users can create custom patterns, and the system can learn from user groupings
 */
export const issuePatterns = pgTable(
  'issue_patterns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Pattern name for display
    name: text('name').notNull(),
    // Description of what this pattern matches
    description: text('description'),
    // Source systems this pattern applies to (empty = all)
    sources: text('sources').array(),
    // Regex or simple pattern for matching
    pattern: text('pattern').notNull(),
    // Is this a regex pattern?
    isRegex: boolean('is_regex').notNull().default(false),
    // Suggested severity when this pattern matches
    suggestedSeverity: issueSeverityEnum('suggested_severity').notNull().default('medium'),
    // Suggested category
    suggestedCategory: text('suggested_category'),
    // Is this a system-provided pattern or user-created?
    isSystem: boolean('is_system').notNull().default(false),
    // Is this pattern enabled?
    isEnabled: boolean('is_enabled').notNull().default(true),
    // How many times this pattern has matched
    matchCount: integer('match_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('issue_patterns_is_enabled_idx').on(table.isEnabled),
    index('issue_patterns_is_system_idx').on(table.isSystem),
  ]
);

/**
 * Analysis conversations - stores AI analysis sessions with follow-up support
 * Each conversation is tied to an issue and stores the full message history
 */
export const analysisConversations = pgTable(
  'analysis_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The issue this conversation is about
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    // Full message history (user questions and AI responses)
    messages: jsonb('messages')
      .$type<
        Array<{
          role: 'user' | 'assistant';
          content: string;
          timestamp: string; // ISO date string
          tokensUsed?: number;
        }>
      >()
      .notNull()
      .default([]),
    // Snapshot of the context at conversation start (for consistent follow-ups)
    contextSnapshot: jsonb('context_snapshot'),
    // AI provider and model used
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    // Total tokens used in this conversation
    totalTokens: integer('total_tokens').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('analysis_conversations_issue_id_idx').on(table.issueId),
    index('analysis_conversations_created_at_idx').on(table.createdAt),
  ]
);

/**
 * AI Provider settings - stores user's AI configuration
 * Supports multiple providers (OpenAI, Anthropic, local LLMs, etc.)
 */
export const aiProviderSettings = pgTable(
  'ai_provider_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Provider identifier (openai, anthropic, ollama, etc.)
    provider: text('provider').notNull(),
    // Display name
    name: text('name').notNull(),
    // API key (encrypted in practice)
    apiKey: text('api_key'),
    // Base URL for self-hosted providers
    baseUrl: text('base_url'),
    // Model to use
    model: text('model').notNull(),
    // Max tokens for responses
    maxTokens: integer('max_tokens').default(1000),
    // Temperature for generation
    temperature: real('temperature').default(0.7),
    // Is this the default provider?
    isDefault: boolean('is_default').notNull().default(false),
    // Is this provider enabled?
    isEnabled: boolean('is_enabled').notNull().default(true),
    // Last successful test
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    lastTestResult: text('last_test_result'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ai_provider_settings_provider_idx').on(table.provider),
    index('ai_provider_settings_is_default_idx').on(table.isDefault),
  ]
);

// Relations
export const serversRelations = relations(servers, ({ many }) => ({
  logEntries: many(logEntries),
  sessions: many(sessions),
  aiAnalyses: many(aiAnalyses),
  issues: many(issues),
  logFileStates: many(logFileState),
}));

export const logFileStateRelations = relations(logFileState, ({ one }) => ({
  server: one(servers, {
    fields: [logFileState.serverId],
    references: [servers.id],
  }),
}));

export const logEntriesRelations = relations(logEntries, ({ one, many }) => ({
  server: one(servers, {
    fields: [logEntries.serverId],
    references: [servers.id],
  }),
  aiAnalyses: many(aiAnalyses),
  issueOccurrences: many(issueOccurrences),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  server: one(servers, {
    fields: [sessions.serverId],
    references: [servers.id],
  }),
  playbackEvents: many(playbackEvents),
  aiAnalyses: many(aiAnalyses),
}));

export const playbackEventsRelations = relations(playbackEvents, ({ one }) => ({
  session: one(sessions, {
    fields: [playbackEvents.sessionId],
    references: [sessions.id],
  }),
}));

export const aiAnalysesRelations = relations(aiAnalyses, ({ one }) => ({
  server: one(servers, {
    fields: [aiAnalyses.serverId],
    references: [servers.id],
  }),
  logEntry: one(logEntries, {
    fields: [aiAnalyses.logEntryId],
    references: [logEntries.id],
  }),
  session: one(sessions, {
    fields: [aiAnalyses.sessionId],
    references: [sessions.id],
  }),
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
  server: one(servers, {
    fields: [issues.serverId],
    references: [servers.id],
  }),
  occurrences: many(issueOccurrences),
  conversations: many(analysisConversations),
}));

export const issueOccurrencesRelations = relations(issueOccurrences, ({ one }) => ({
  issue: one(issues, {
    fields: [issueOccurrences.issueId],
    references: [issues.id],
  }),
  logEntry: one(logEntries, {
    fields: [issueOccurrences.logEntryId],
    references: [logEntries.id],
  }),
  server: one(servers, {
    fields: [issueOccurrences.serverId],
    references: [servers.id],
  }),
}));

export const analysisConversationsRelations = relations(analysisConversations, ({ one }) => ({
  issue: one(issues, {
    fields: [analysisConversations.issueId],
    references: [issues.id],
  }),
}));
