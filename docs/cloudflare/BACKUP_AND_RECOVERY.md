# Backup and Recovery

**Date:** 2026-10-19
**Status:** The local export/restore rehearsal passes against disposable D1. A protected remote export is still an owner-approved operational action and was not copied into the repository.

## D1 backup policy

For the existing remote database, schedule and retain encrypted D1 exports outside the repository. The operator should use the current Wrangler D1 export command for the exact account/version, for example:

```bash
wrangler d1 export wellness-salon --remote --output ./private-backups/wellness-salon-<timestamp>.sql
```

Confirm the current CLI syntax before execution. Never print credentials or export contents in logs/chat. Store backups with restricted access and a documented retention period.

## Recovery rehearsal

The repeatable local rehearsal applies all migrations, generates a synthetic bootstrap, exports the local D1 database with schema and data, restores it into a fresh local persistence directory, and compares representative row counts. It never targets remote D1:

```bash
npm run d1:recovery:rehearsal
```

Latest rehearsal result: PASS on 2026-10-19; `services=12`, `staff=6`, `auth_users=2`, and `shop_config=1` matched after restore.

1. Export the remote D1 database before schema or application changes.
2. Verify the export checksum and encrypted storage.
3. Restore into a fresh disposable D1 database, never over the source as the first test.
4. Apply the reviewed schema and verify row counts, indexes, constraints, timezone config, audit/receipt integrity, and representative read models.
5. Run auth, queue, payment, closing, retention, and public-redaction smoke tests.
6. Record the result before approving any production cutover.

## Current state

The remote `wellness-salon` D1 database and required Wrangler secrets exist; its schema and operational row counts were checked read-only before deployment. `AUTH_SECRET` and `CRON_SECRET` are present as Worker secrets. No production-data export was downloaded by this task, no backup bucket was configured, and no production-data reset was performed. Before a schema change, the owner/operator must run the remote export with restricted file permissions and record its checksum outside Git.

