# County Parcel Ownership Pipeline — Agent Runbook

This pipeline **downloads county parcel GIS upfront** (batch / agent-driven), tiles it, and stores **owned PMTiles** in Cloudflare R2. The live map keeps using `/api/tiles` and does **not** download counties on demand for each user.

## Flow

1. Claim next county from the catalog (largest→smallest by Census population).
2. If `needs_source`, discover a public ArcGIS FeatureServer/MapServer or GeoJSON download.
3. Validate the endpoint, set `source` + `fieldMap`, status → `ready`.
4. Run county pipeline: download → normalize → tippecanoe (MBTiles) → **pmtiles convert** → upload one archive to R2 → update manifest.
5. Report `complete`, `failed`, or `no_public_source`.
6. Repeat until the catalog is exhausted.

LandRecords remains a **runtime fallback** until owned coverage is good. Set `PARCEL_TILES_OWNED_ONLY=1` only after review.

## Prerequisites

- Node 20+
- `tippecanoe` on PATH
- `pmtiles` CLI on PATH ([go-pmtiles](https://github.com/protomaps/go-pmtiles))
- Env:
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
  - Optional catalog API: `PARCEL_PIPELINE_API_BASE`, `PARCEL_PIPELINE_SECRET` (or `CRON_SECRET`)
  - Optional: `PARCEL_PIPELINE_AGENT`

## npm scripts

```bash
npm run parcel:status
npm run parcel:seed
npm run parcel:claim
npm run parcel:discover -- --fips=48439 --url=https://.../MapServer/0 --persist
npm run parcel:run -- --fips=48439
npm run parcel:tile -- --fips=48439
npm run parcel:upload -- --fips=48439          # PMTiles one-shot upload
npm run parcel:nationwide
npm run parcel:nationwide:parallel
```

Parallel nationwide env knobs:

- `PARCEL_NATIONWIDE_WORKERS=10`
- `PARCEL_TILE_CONCURRENCY=2` — max simultaneous tippecanoe jobs
- `PARCEL_UPLOAD_COUNTY_CONCURRENCY=6` — max simultaneous PMTiles uploads
- `PARCEL_DOWNLOAD_RESUME=1`
- `PARCEL_DOWNLOAD_RETRIES=8`
- `PARCEL_REPAIR_WORKERS=5`
- `PARCEL_STALE_RUNNING_MS=3600000` — reclaim stuck `running` after 1h without heartbeat

Work files: `parcel_data/{fips}/` (gitignored). Progress: `parcel_data/nationwide-progress.json`. Heartbeats: `parcel_data/.heartbeats/{fips}` (lock-free).

## Storage layout

| Prefix | Role |
|--------|------|
| `owned/pmtiles/{fips}.pmtiles` | **Preferred** owned county archive (layer `parcel_us`, z15–16) |
| `owned/pmtiles/manifest.json` | Bounds index for `/api/tiles` lookup |
| `owned/tiles/{z}/{x}/{y}.pbf` | Legacy per-tile owned XYZ (still served if present) |
| `tiles/{z}/{x}/{y}.pbf` | LandRecords cache (unchanged) |

`/api/tiles` read order: **owned PMTiles** → legacy owned XYZ → LandRecords cache → LandRecords upstream.

## Why PMTiles

Exploding each county into 50k–260k individual R2 PUTs was the nationwide bottleneck (hours per metro, frequent stalls). One multipart upload per county finishes in minutes and resumes cleanly.

## Source quality gates

- Discovery rejects specialty/subset titles (surplus land, easements, Big Bear–style subsets, etc.)
- Population-scaled minimum feature counts
- Post-download thin-layer rejection (`thin_source`)
- Prefer curated `sources.seed.json` over auto-discovery overlays

## API (ops-only)

Auth: `Authorization: Bearer $PARCEL_PIPELINE_SECRET` (or `CRON_SECRET`).

- `POST /api/parcel-pipeline/counties`
- `GET /api/parcel-pipeline/counties?action=summary|list|get&fips=`
- `POST /api/parcel-pipeline/report`

## Notes

- Many counties lack redistributable open parcel layers; leave them on LandRecords fallback.
- Starter sources: [`data/counties/sources.seed.json`](../data/counties/sources.seed.json).
- Delete local `raw.ndjson` / `normalized.ndjson` / `*.mbtiles` after a successful PMTiles upload.
