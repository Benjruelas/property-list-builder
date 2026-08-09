# County Parcel Ownership Pipeline — Agent Runbook

This pipeline **downloads county parcel GIS upfront** (batch / agent-driven), tiles it, and stores owned MVT tiles in Cloudflare R2. The live map keeps using `/api/tiles` and does **not** download counties on demand for each user.

## Flow

1. Claim next county from the catalog.
2. If `needs_source`, discover a public ArcGIS FeatureServer/MapServer or GeoJSON download.
3. Validate the endpoint, set `source` + `fieldMap`, status → `ready`.
4. Run `run-county.mjs` for that FIPS (download → normalize → tippecanoe → R2 upload).
5. Report `complete`, `failed`, or `no_public_source`.
6. Repeat until the catalog is exhausted.

LandRecords remains a **runtime fallback** until owned coverage is good. Set `PARCEL_TILES_OWNED_ONLY=1` only after review.

## Prerequisites

- Node 20+
- `tippecanoe` on PATH
- Python 3 (used to extract tiles from MBTiles if better-sqlite3 is not installed)
- Env:
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
  - Optional catalog API: `PARCEL_PIPELINE_API_BASE` (e.g. `https://knockscout.app`), `PARCEL_PIPELINE_SECRET` (or `CRON_SECRET`)
  - Optional: `PARCEL_PIPELINE_AGENT` (agent id for claims)

## npm scripts

```bash
npm run parcel:status
npm run parcel:seed          # init KV queues (needs API env)
npm run parcel:claim         # claim next county
npm run parcel:discover -- --fips=48439 --url=https://.../MapServer/0 --persist
npm run parcel:run -- --fips=48439
```

Work files land in `parcel_data/{fips}/` (gitignored).

## Discovery tips

Search patterns:

- `{County} {ST} GIS parcels FeatureServer`
- `{County} County {ST} parcel MapServer`
- `site:arcgis.com {County} {ST} parcels`

Validate with:

```bash
npm run parcel:discover -- --fips=XXXXX --url='https://.../FeatureServer/0'
```

Confirm polygon geometry and useful fields (parcel id, situs address, owner when public). Respect county license / redistribution terms; if redistribution is prohibited, report `no_public_source` with a note.

## Storage layout

| Prefix | Role |
|--------|------|
| `owned/tiles/{z}/{x}/{y}.pbf` | Permanent owned county tiles (layer `parcel_us`, z15–16) |
| `tiles/{z}/{x}/{y}.pbf` | Existing LandRecords cache (unchanged) |

`/api/tiles` reads **owned first**, then cache, then LandRecords.

## API (ops-only)

Auth: `Authorization: Bearer $PARCEL_PIPELINE_SECRET` (or `CRON_SECRET`).

- `POST /api/parcel-pipeline/counties` `{ "action": "seed"|"claim"|"update", ... }`
- `GET /api/parcel-pipeline/counties?action=summary|list|get&fips=`
- `POST /api/parcel-pipeline/report` `{ "fips", "status", "stats?", "error?" }`

## Status values

`needs_source` → `ready` → `running` → `complete` | `failed` | `no_public_source`

## Notes

- Many counties lack redistributable open parcel layers; leave them on LandRecords fallback.
- Boundary tiles merge features when adjacent counties upload the same `z/x/y`.
- Starter sources live in [`data/counties/sources.seed.json`](../data/counties/sources.seed.json); agents expand the long tail.
