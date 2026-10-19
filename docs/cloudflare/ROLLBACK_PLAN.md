# Rollback Plan

**Date:** 2026-10-19
**Status:** Prepared runbook; the Git-based workers.dev deployment and read-only smoke are current, while unattended production traffic cutover remains blocked by incomplete mutation/capacity/device evidence.

## Before production traffic cutover

The current application is not ready for a traffic cutover because remote D1 evidence is incomplete. Keep the last verified Worker version and D1 export procedure available. A Worker version rollback is not a substitute for finishing the D1 release gates.

## After an approved Worker deployment

1. Stop new rollout activity and capture the Worker version, error rate, route, and D1 health evidence.
2. Use Cloudflare's version/rollback mechanism to return traffic to the last verified Worker version, following the current Wrangler/Cloudflare documentation.
3. If the incident involves data writes, take a D1 export before repair and preserve the audit trail.
4. Apply a forward corrective migration or restore into a reviewed fresh database; do not edit production tables ad hoc.
5. Re-run auth, queue, payment, realtime, timezone, cron, and public-redaction smoke tests.
6. Record the incident and only redeploy after owner approval.

## Repository rollback limitation

The workspace has no in-tree `.git`, but the attached external Git metadata at `/private/tmp/wellness-salon-git` is writable and the verified branch is pushed to `origin`. Roll back through a committed Git revision and the GitHub Actions workflow; do not use destructive resets or delete files to simulate rollback. Preserve the current tree and use the documented forward/backup procedures.

