/**
 * App configuration — the only file you need to edit per deployment.
 *
 * API_BASE_URL is the server root (no trailing slash, no /api). It MUST be
 * https:// in release builds (cleartext HTTP is disabled in the manifest).
 *
 * To ship a white-label build for another server, change API_BASE_URL (and
 * APP_NAME) here, bump versionCode/versionName in android/app/build.gradle,
 * and build a signed release (see README.md).
 */

export const API_BASE_URL =
  'https://college-bus-tracking-system-ri73.onrender.com';

export const APP_NAME = 'Bus Driver';

/** How often queued GPS fixes are sent to the server while a trip runs. */
export const PING_INTERVAL_MS = 5000;

/** Max fixes per upload request (server accepts up to 300). */
export const PING_BATCH_SIZE = 200;

/** Offline queue cap; oldest fixes are dropped beyond this. */
export const MAX_QUEUED_PINGS = 1000;

/** Longest wait between retries while the server is unreachable. */
export const MAX_RETRY_DELAY_MS = 60_000;

/** Re-send the last fix this often when the bus is stationary (keeps "live" status). */
export const HEARTBEAT_MS = 30_000;

/** Fixes worse than this (metres) are dropped on the device. */
export const MAX_ACCURACY_M = 150;

export const REQUEST_TIMEOUT_MS = 15_000;
