#!/usr/bin/env node
/**
 * Convert normalized GeoJSON → MBTiles with tippecanoe (layer parcel_us).
 *
 * Speed knobs (env):
 *   PARCEL_MIN_ZOOM (default 15)
 *   PARCEL_MAX_ZOOM (default 15 — z15-first nationwide; set 16 for full detail)
 *   PARCEL_TILE_FULL_DETAIL=1 — restore --no-feature-limit --no-tile-size-limit
 *   PARCEL_TILE_TIMEOUT_MS — kill tippecanoe if it exceeds this (default 45m)
 */
import fs from 'fs'
import path from 'path'
import { spawn, spawnSync } from 'child_process'
import { parseArgs, countyWorkDir } from './lib/paths.mjs'
import {
  PARCEL_SOURCE_LAYER,
  PARCEL_MIN_ZOOM as DEFAULT_MIN_ZOOM,
  PARCEL_MAX_ZOOM as DEFAULT_MAX_ZOOM,
} from '../../api/_lib/parcelPipeline/constants.js'

function tippecanoeAvailable() {
  const r = spawnSync('tippecanoe', ['--version'], { encoding: 'utf8' })
  return r.status === 0
}

function runTippecanoe(cmd, timeoutMs) {
  return new Promise((resolve) => {
    console.log('[tile]', cmd.join(' '))
    // New process group so timeout can kill tippecanoe + any helpers.
    const child = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', detached: true })
    let timedOut = false
    const killTree = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL')
      } catch {
        try {
          child.kill('SIGKILL')
        } catch {
          /* ignore */
        }
      }
    }
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true
            console.error(`[tile] tippecanoe timeout after ${timeoutMs}ms — killing`)
            killTree()
          }, timeoutMs)
        : null
    child.on('exit', (code, signal) => {
      if (timer) clearTimeout(timer)
      if (timedOut) resolve({ status: 124, signal: 'SIGKILL' })
      else resolve({ status: code ?? 1, signal })
    })
  })
}

async function main() {
  const args = parseArgs()
  const fips = String(args.fips || args._[0] || '').padStart(5, '0')
  if (!fips || fips === '00000') {
    console.error('Usage: tile-county.mjs --fips=48439')
    process.exit(1)
  }
  if (!tippecanoeAvailable()) {
    console.error('tippecanoe not found. Install: https://github.com/felt/tippecanoe')
    process.exit(1)
  }

  const minZoom = Math.max(0, Number(process.env.PARCEL_MIN_ZOOM || DEFAULT_MIN_ZOOM))
  // z15-first by default for nationwide throughput; set PARCEL_MAX_ZOOM=16 for full.
  const maxZoom = Math.max(
    minZoom,
    Number(process.env.PARCEL_MAX_ZOOM || Math.min(15, DEFAULT_MAX_ZOOM)),
  )
  const fullDetail =
    process.env.PARCEL_TILE_FULL_DETAIL === '1' || process.env.PARCEL_TILE_FULL_DETAIL === 'true'
  const timeoutMs = Number(process.env.PARCEL_TILE_TIMEOUT_MS || 45 * 60 * 1000)

  const dir = countyWorkDir(fips)
  const ndjson = path.join(dir, 'normalized.ndjson')
  const geojson = path.join(dir, 'normalized.geojson')
  const input = fs.existsSync(ndjson) ? ndjson : geojson
  if (!fs.existsSync(input)) {
    console.error(`Missing ${ndjson} — run normalize-county first`)
    process.exit(1)
  }

  // Drop null / world-spanning geometries. One bad (-180,-90)-(180,90) polygon
  // makes tippecanoe try to build the entire planet at z15 (multi-hour hang).
  const filtered = path.join(dir, 'normalized.tilable.ndjson')
  {
    const py = `
import json,sys,math
inp,out=sys.argv[1],sys.argv[2]
kept=dropped=0
world=0
absurd=0

def walk(c, pts):
  if not c: return
  if isinstance(c[0], (int, float)):
    pts.append((float(c[0]), float(c[1]))); return
  for x in c: walk(x, pts)

with open(inp) as f, open(out,"w") as o:
  for line in f:
    line=line.strip()
    if not line: continue
    try: feat=json.loads(line)
    except Exception:
      dropped+=1; continue
    g=feat.get("geometry")
    if not g or g.get("type") in (None,"GeometryCollection") or not g.get("coordinates"):
      dropped+=1; continue
    pts=[]
    try: walk(g.get("coordinates"), pts)
    except Exception:
      dropped+=1; continue
    if not pts:
      dropped+=1; continue
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    if any(math.isnan(v) or math.isinf(v) for v in xs+ys):
      dropped+=1; continue
    minx,maxx,miny,maxy=min(xs),max(xs),min(ys),max(ys)
    # Exact world/sentinel envelopes (seen in Pima AZ parcel 20410003).
    if minx <= -179.5 and maxx >= 179.5 and miny <= -89.5 and maxy >= 89.5:
      world+=1; dropped+=1; continue
    # No US county/borough needs a single parcel this large.
    if (maxx - minx) >= 40 or (maxy - miny) >= 25:
      absurd+=1; dropped+=1; continue
    o.write(line+"\\n"); kept+=1
print(f"[tile] geometry filter kept={kept} dropped={dropped} world={world} absurd={absurd}", flush=True)
`
    const fr = spawnSync('python3', ['-c', py, input, filtered], { stdio: 'inherit' })
    if (fr.status !== 0) {
      console.error('geometry filter failed')
      process.exit(fr.status || 1)
    }
  }

  const mbtiles = path.join(dir, `${fips}.mbtiles`)
  for (const p of [mbtiles, `${mbtiles}-journal`]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch {
      /* ignore */
    }
  }

  const cmd = [
    'tippecanoe',
    '--output',
    mbtiles,
    '--force',
    `--layer=${PARCEL_SOURCE_LAYER}`,
    `--minimum-zoom=${minZoom}`,
    `--maximum-zoom=${maxZoom}`,
    '--drop-densest-as-needed',
    // Do NOT use --extend-zooms-if-still-dropping for z15-first nationwide:
    // with a bad global-bbox feature it expands work toward planetary z15.
    // Faster defaults: allow tippecanoe to drop/simplify instead of unbounded tiles.
    ...(fullDetail
      ? ['--no-feature-limit', '--no-tile-size-limit', '--extend-zooms-if-still-dropping']
      : ['--maximum-tile-bytes=500000', '--full-detail=10', '--low-detail=8']),
    '--read-parallel',
    filtered,
  ]

  const r = await runTippecanoe(cmd, timeoutMs)
  try {
    fs.unlinkSync(filtered)
  } catch {
    /* ignore */
  }
  if (r.status !== 0) {
    console.error('tippecanoe failed', r)
    process.exit(r.status || 1)
  }

  const stat = fs.statSync(mbtiles)
  const pmtilesPath = path.join(dir, `${fips}.pmtiles`)
  const hasPmtilesCli = spawnSync('pmtiles', ['--help'], { encoding: 'utf8' }).status === 0
  if (hasPmtilesCli) {
    if (fs.existsSync(pmtilesPath)) fs.unlinkSync(pmtilesPath)
    console.log(`[tile] pmtiles convert → ${pmtilesPath}`)
    const c = spawnSync('pmtiles', ['convert', mbtiles, pmtilesPath], { stdio: 'inherit' })
    if (c.status !== 0) {
      console.error('pmtiles convert failed')
      process.exit(c.status || 1)
    }
  } else {
    console.warn('[tile] pmtiles CLI missing — upload step will require it')
  }

  fs.writeFileSync(
    path.join(dir, 'tile-meta.json'),
    JSON.stringify(
      {
        fips,
        mbtiles,
        pmtiles: fs.existsSync(pmtilesPath) ? pmtilesPath : undefined,
        bytes: fs.existsSync(pmtilesPath) ? fs.statSync(pmtilesPath).size : stat.size,
        layer: PARCEL_SOURCE_LAYER,
        minzoom: minZoom,
        maxzoom: maxZoom,
        fullDetail,
        tiledAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
  console.log(
    `[tile] wrote ${mbtiles} (${stat.size} bytes) z${minZoom}-${maxZoom}` +
      (fs.existsSync(pmtilesPath) ? ` + ${pmtilesPath} (${fs.statSync(pmtilesPath).size} bytes)` : ''),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
