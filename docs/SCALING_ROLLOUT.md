# Scaling Rollout Guide

Production steps to enable KV sharding, versioned polling, and auth caching. See `.env.example` for all flag names.

## 1. Set Vercel environment variables

| Variable | Recommended value |
|---|---|
| `FLAG_VERSIONED_POLL` | `1` |
| `FLAG_LEADS_LIST_VIEW` | `1` |
| `FLAG_AUTH_CACHE` | `1` |
| `FLAG_PRESIGNED_PHOTOS` | `1` |
| `VITE_PRESIGNED_PHOTOS` | `1` |
| `FLAG_LEADS_SHARDED` | `on` (after backfill) |
| `FLAG_PIPELINES_SHARDED` | `on` (after backfill) |
| `MIGRATE_SECRET` | strong random secret |
| `MIGRATE_ADMIN_UIDS` | comma-separated admin Firebase UIDs |

Ensure `FIREBASE_PROJECT_ID` or `VITE_FIREBASE_PROJECT_ID` is set when `FLAG_AUTH_CACHE=1`.

Keep production defaults for write locks (`FLAG_*_LOCK` unset = ON in production).

## 2. Deploy code

Deploy the branch containing poll-path fixes, shard parity, store extractions, and auth consolidation.

## 3. Backfill shards

Run once against production:

```bash
curl -X POST "https://YOUR_DOMAIN/api/migrate-infra" \
  -H "Authorization: Bearer YOUR_ADMIN_ID_TOKEN" \
  -H "X-Migrate-Secret: YOUR_MIGRATE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"target":"all"}'
```

Expected response includes `{ ok: true, leads: { owners, leads, sharedLinks }, pipelines: { ... } }`.

## 4. Enable sharded reads

After backfill succeeds, set:

- `FLAG_LEADS_SHARDED=on`
- `FLAG_PIPELINES_SHARDED=on`

Redeploy or wait for env propagation.

## 5. Smoke test

- Sign in → leads and pipelines load
- Open a team-shared lead as collaborator
- PATCH a lead → refresh → change persists
- Move a deal in a pipeline → persists
- Upload a photo (presigned path)
- Pan the map → tiles load

## 6. Load test (optional)

```bash
API_BASE=https://YOUR_DOMAIN/api \
FIREBASE_TOKEN=your_id_token \
CONCURRENCY=50 \
ITERATIONS=20 \
node scripts/load-test-polls.mjs
```

Watch Vercel function duration, 304 rate, and Redis/KV command counts in the dashboard.

## Rollback levers

| Symptom | Action |
|---|---|
| Missing shared leads | `FLAG_LEADS_SHARDED=off` |
| Missing shared pipelines | `FLAG_PIPELINES_SHARDED=off` |
| Stale ETag / wrong 304 | `FLAG_VERSIONED_POLL=0` |
| Auth errors after cache enable | `FLAG_AUTH_CACHE=0` |

Monolith keys remain the write source of truth — rollback is immediate and safe.
