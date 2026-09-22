# KnockScout Incident Runbooks

## KV / Redis unavailable

1. Check `/api/health` — `checks.kv` should be `true`.
2. Verify `KV_REST_API_URL` / `REDIS_URL` in Vercel env.
3. Roll back sharding flags: `FLAG_LEADS_SHARDED=off`, `FLAG_PIPELINES_SHARDED=off`.
4. Page owner if error rate > 1% for 5 minutes.

## R2 media failures

1. Confirm R2 credentials and bucket CORS for presigned PUT.
2. Set `FLAG_PRESIGNED_PHOTOS=0` to force API proxy fallback.
3. Inspect orphan keys via `scripts/backup-kv.mjs` inventory notes.

## PDF backlog

1. Check `pdfQueueStats()` in function logs.
2. Ten+ concurrent PDFs should queue, not spawn unbounded Chromium.
3. Cached `pdfKey` on reports should serve without regeneration.

## Cron / reminders

1. Requires `CRON_SECRET` in production.
2. `push_subscribers` set must be populated; avoid `KEYS` scans.
3. Re-run manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://knockscout.app/api/cron-task-reminders`

## Account-switch data leak

1. Verify `syncLocalBlobStorageIfUserChanged` runs on login.
2. `user_leads_local_uid` must match authenticated UID before rendering cache.
3. Clear `sessionStorage.__userData_blob_uid` in support repro.

## Migration rollback

See `docs/SCALING_ROLLOUT.md` rollback table. Monolith keys remain write source until cutover flags are on for 7+ days.

## Restore drill (quarterly)

1. Run `node scripts/backup-kv.mjs` against production credentials in a secure environment.
2. Restore to staging Redis; run shadow parity (`FLAG_*_SHARDED=shadow`).
3. Target RPO: 24h (nightly backup), RTO: 4h.
