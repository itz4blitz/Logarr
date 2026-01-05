-- Add thumbnail, series, and season fields to playback_events
ALTER TABLE "playback_events" ADD COLUMN "thumbnail_url" text;
ALTER TABLE "playback_events" ADD COLUMN "series_name" text;
ALTER TABLE "playback_events" ADD COLUMN "season_name" text;
