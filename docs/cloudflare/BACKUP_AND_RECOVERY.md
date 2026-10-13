# Backup and Recovery

**Date:** 2026-10-12  
**Status:** Procedure documented; no remote D1 database exists to back up.

## D1 backup policy

After an approved remote database exists, schedule and retain encrypted D1 exports outside the repository. The operator should use the current Wrangler D1 export command for the exact account/version, for example:

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

No remote D1 database, export, backup bucket, or production secret has been created. Existing PostgreSQL/Docker volumes remain outside this migration and must be preserved.

