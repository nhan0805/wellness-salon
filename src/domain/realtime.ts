/**
 * The SSE stream provides an initial snapshot and bounded keepalives. Polling
 * remains the correctness fallback because D1/Workers do not provide a
 * cross-instance event bus for this single-salon deployment.
 */
export const BOARD_POLL_INTERVAL_MS = 3_000;
export const BOARD_STALE_AFTER_MS = 45_000;
export const ADMIN_REFRESH_INTERVAL_MS = 15_000;
