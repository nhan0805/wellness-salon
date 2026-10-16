/**
 * The SSE stream provides an initial snapshot and bounded keepalives. Polling
 * remains the correctness fallback because D1/Workers do not provide a
 * cross-instance event bus for this single-salon deployment.
 */
// The SSE stream carries the initial board snapshot; polling is the fallback
// for lost updates. Three-second polling multiplied across open tablets made
// every idle board repeatedly pay for a full D1/Prisma read and was enough to
// hit the Worker CPU limit under light concurrency.
export const BOARD_POLL_INTERVAL_MS = 15_000;
export const BOARD_STALE_AFTER_MS = 45_000;
export const ADMIN_REFRESH_INTERVAL_MS = 15_000;
