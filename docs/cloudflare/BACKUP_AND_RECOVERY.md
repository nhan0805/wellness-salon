# Backup and Recovery

**Date:** 2026-10-13
**Status:** Procedure documented; the remote D1 database exists and was preserved during the workers.dev deployment. No export or restore was run in this deployment.

## D1 backup policy

For the existing remote database, schedule and retain encrypted D1 exports outside the repository. The operator should use the current Wrangler D1 export command for the exact account/version, for example:

```bash
wrangler d1 export wellness-salon --remote --output ./private-backups/wellness-salon-<timestamp>.sql
```

Confirm the current CLI syntax before execution. Never print credentials or export contents in logs/chat. Store backups with restricted access and a documented retention period.

## Recovery rehearsal

1. Export the remote D1 database before schema or application changes.
2. Verify the export checksum and encrypted storage.
3. Restore into a fresh disposable D1 database, never over the source as the first test.
4. Apply the reviewed schema and verify row counts, indexes, constraints, timezone config, audit/receipt integrity, and representative read models.
5. Run auth, queue, payment, closing, retention, and public-redaction smoke tests.
6. Record the result before approving any production cutover.

## Current state

The remote `wellness-salon` D1 database and required Wrangler secrets exist; its schema and operational row counts were checked read-only before deployment. No D1 export, backup bucket, restore rehearsal, or production-data reset was performed. Existing PostgreSQL/Docker volumes remain outside this migration and must be preserved.

