import type { NormalizedActivity } from '@logarr/core';

/**
 * Compute the next `lastActivitySync` value from a batch of activities.
 *
 * Only activities whose timestamp is an event time count (`advancesSyncCursor`
 * !== false). Synthetic rows stamped with the detection time are ignored so they
 * can't move the cursor to "now" and hide history not returned in this poll.
 *
 * @returns the max qualifying timestamp, or undefined if none qualify
 *          (caller should leave the stored cursor unchanged).
 */
export function computeSyncCursor(activities: readonly NormalizedActivity[]): Date | undefined {
  let max: Date | undefined;
  for (const activity of activities) {
    if (activity.advancesSyncCursor === false) continue;
    if (!max || activity.timestamp > max) max = activity.timestamp;
  }
  return max;
}
