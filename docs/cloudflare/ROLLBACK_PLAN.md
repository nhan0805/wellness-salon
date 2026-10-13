# Rollback Plan

**Date:** 2026-10-12  
**Status:** Prepared runbook; no Cloudflare deployment has occurred.

## Before first deployment

The current application is not ready for a traffic cutover because the D1 data layer is incomplete. Keep the existing PostgreSQL/Docker path available as the behavioral reference and do not delete its volumes. A deployment rollback is not a substitute for finishing the D1 port.

## After an approved Worker deployment

1. Stop new rollout activity and capture the Worker version, error rate, route, and D1 health evidence.
2. Use Cloudflare's version/rollback mechanism to return traffic to the last verified Worker version, following the current Wrangler/Cloudflare documentation.
3. If the incident involves data writes, take a D1 export before repair and preserve the audit trail.
4. Apply a forward corrective migration or restore into a reviewed fresh database; do not edit production tables ad hoc.
5. Re-run auth, queue, payment, realtime, timezone, cron, and public-redaction smoke tests.
6. Record the incident and only redeploy after owner approval.

## Repository rollback limitation

This workspace does not contain usable writable Git metadata, so a feature branch or commit could not be created. The migration work is left as workspace changes. Do not use destructive resets or delete files to simulate rollback; preserve the current tree and use the documented forward/backup procedures.

