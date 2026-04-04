import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { fromArrayBuffer } from 'geotiff'
import PDFDocument from 'pdfkit'
import crypto from 'crypto'

const CACHE_TTL = 30 * 24 * 3600 * 1000
const M_FT = 3.28084
const SQM_SQFT = 10.7639
const PW = 612, PH = 792, MG = 40, CW = PW - 2 * MG

/* ── R2 ──────────────────────────────────────────────────────── */

let _s3
function s3() {
  if (_s3) return _s3
  _s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  })
  return _s3
}
async function r2Get(key) {
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }))
    if (Date.now() - (r.LastModified?.getTime() ?? 0) > CACHE_TTL) return null
    const ch = []; for await (const c of r.Body) ch.push(c); return Buffer.concat(ch)
  } catch (e) { if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null; throw e }
}
function r2Put(key, body, ct = 'application/pdf') {
  return s3().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: body, ContentType: ct }))
}

/* ── Helpers ──────────────────────────────────────────────────── */

function pitchRise(deg) { return Math.round(12 * Math.tan((deg || 0) * Math.PI / 180)) }
function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] }
function pitchHex(deg) {
  if (deg <= 15) return '#3B82F6'
  if (deg <= 25) return '#22C55E'
  if (deg <= 35) return '#EAB308'
  if (deg <= 45) return '#F97316'
  return '#EF4444'
}
function suggestedWaste(nFacets) {
  if (nFacets <= 6) return 10
  if (nFacets <= 12) return 12
  if (nFacets <= 20) return 15
  if (nFacets <= 30) return 17
  return 20
}
function fmtFtIn(rawFt) {
  const totalIn = Math.round(rawFt * 12)
  const ft = Math.floor(totalIn / 12)
  const inches = totalIn % 12
  return inches > 0 ? `${ft}ft ${inches}in` : `${ft}ft 0in`
}

/* ── GeoTIFF ─────────────────────────────────────────────────── */

async function parseTiff(buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const tiff = await fromArrayBuffer(ab)
  const img = await tiff.getImage()
  const [data] = await img.readRasters()
  return { data, w: img.getWidth(), h: img.getHeight(), origin: img.getOrigin(), res: img.getResolution() }
}

/* ── Building isolation (flood fill from image center) ───────── */

function isolateBuilding(mask, w, h) {
  const cx = Math.round(w / 2), cy = Math.round(h / 2), iso = new Uint8Array(w * h)
  let best = Infinity, start = -1
  const sr = Math.min(80, Math.floor(Math.max(w, h) / 3))
  for (let dy = -sr; dy <= sr; dy++) for (let dx = -sr; dx <= sr; dx++) {
    const x = cx + dx, y = cy + dy
    if (x < 0 || x >= w || y < 0 || y >= h) continue
    const i = y * w + x; if (!mask[i]) continue
    const d = dx * dx + dy * dy; if (d < best) { best = d; start = i }
  }
  if (start < 0) return iso
  const q = [start]; iso[start] = 1; let hd = 0
  while (hd < q.length) {
    const i = q[hd++], ix = i % w, iy = (i - ix) / w
    for (const [nx, ny] of [[ix - 1, iy], [ix + 1, iy], [ix, iy - 1], [ix, iy + 1]]) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const ni = ny * w + nx; if (iso[ni] || !mask[ni]) continue
      iso[ni] = 1; q.push(ni)
    }
  }
  return iso
}

/* ── Phase 1: DSM Gaussian smoothing ─────────────────────────── */

function smoothDSM(elev, mask, w, h) {
  const out = new Float32Array(elev.length)
  const k = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (!mask[i] || isNaN(elev[i])) { out[i] = elev[i]; continue }
    let sum = 0, wt = 0
    for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) {
      const ny = y + ky, nx = x + kx
      if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
      const ni = ny * w + nx
      if (!mask[ni] || isNaN(elev[ni])) continue
      const kw = k[(ky + 1) * 3 + (kx + 1)]
      sum += elev[ni] * kw; wt += kw
    }
    out[i] = wt > 0 ? sum / wt : elev[i]
  }
  return out
}

/* ── Phase 2: Curvature-based ridge/valley detection ─────────── */

function detectCurvature(elev, mask, w, h, pxM) {
  const n = w * h
  const ridgeMap = new Uint8Array(n), valleyMap = new Uint8Array(n)
  const RIDGE_T = 1.5, VALLEY_T = 1.5
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    if (!mask[i] || isNaN(elev[i])) continue
    const c = elev[i]
    const l = (mask[i - 1] && !isNaN(elev[i - 1])) ? elev[i - 1] : c
    const r = (mask[i + 1] && !isNaN(elev[i + 1])) ? elev[i + 1] : c
    const u = (mask[i - w] && !isNaN(elev[i - w])) ? elev[i - w] : c
    const d = (mask[i + w] && !isNaN(elev[i + w])) ? elev[i + w] : c
    const lap = (l + r + u + d - 4 * c) / (pxM * pxM)
    if (lap < -RIDGE_T) ridgeMap[i] = 1
    if (lap > VALLEY_T) valleyMap[i] = 1
  }
  return { ridgeMap, valleyMap }
}

/* ── Surface normals from DSM ────────────────────────────────── */

function computeNormals(elev, mask, w, h, pxM) {
  const n = w * h
  const slopeDeg = new Float32Array(n), azimuthDeg = new Float32Array(n)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    if (!mask[i] || isNaN(elev[i])) continue
    const c = elev[i]
    const l = isNaN(elev[i - 1]) ? c : elev[i - 1], r = isNaN(elev[i + 1]) ? c : elev[i + 1]
    const u = isNaN(elev[i - w]) ? c : elev[i - w], d = isNaN(elev[i + w]) ? c : elev[i + w]
    const gx = (r - l) / (2 * pxM), gy = (d - u) / (2 * pxM)
    slopeDeg[i] = Math.atan(Math.sqrt(gx * gx + gy * gy)) * 180 / Math.PI
    let az = Math.atan2(-gx, gy) * 180 / Math.PI
    if (az < 0) az += 360
    azimuthDeg[i] = az
  }
  return { slopeDeg, azimuthDeg }
}

/* ── Phase 3: Fine-grained facet segmentation ────────────────── */

function segmentFacets(elev, mask, normals, w, h, ridgeMap, valleyMap) {
  const n = w * h, { slopeDeg, azimuthDeg } = normals
  const AZ_BIN = 10, P_BIN = 4, FLAT = 9999, MIN_PX = 30
  const N_AZ = Math.ceil(360 / AZ_BIN), N_P = Math.ceil(90 / P_BIN)

  const barrier = new Uint8Array(n)
  if (ridgeMap && valleyMap) {
    for (let i = 0; i < n; i++) if (ridgeMap[i] || valleyMap[i]) barrier[i] = 1
  }

  const bin = new Int32Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue
    if (slopeDeg[i] < 3) { bin[i] = FLAT; continue }
    bin[i] = (Math.floor(azimuthDeg[i] / AZ_BIN) % N_AZ) * N_P + Math.min(Math.floor(slopeDeg[i] / P_BIN), N_P - 1)
  }

  const labels = new Int32Array(n).fill(-1)
  let nxt = 0
  for (let i = 0; i < n; i++) {
    if (!mask[i] || labels[i] >= 0 || bin[i] < 0) continue
    const b = bin[i], q = [i]; labels[i] = nxt; let hd = 0
    while (hd < q.length) {
      const ci = q[hd++], cx2 = ci % w, cy2 = (ci - cx2) / w
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx2 = cx2 + dx, ny2 = cy2 + dy
        if (nx2 < 0 || nx2 >= w || ny2 < 0 || ny2 >= h) continue
        const ni = ny2 * w + nx2
        if (labels[ni] >= 0 || !mask[ni] || bin[ni] !== b) continue
        if (barrier[ni] && !barrier[ci]) continue
        labels[ni] = nxt; q.push(ni)
      }
    }
    nxt++
  }

  // Pass 1: merge small regions into most-similar neighbor
  const computeNormalStats = () => {
    const sz = new Int32Array(nxt), sinS = new Float32Array(nxt), cosS = new Float32Array(nxt)
    const slpS = new Float32Array(nxt), cnt = new Int32Array(nxt)
    for (let i = 0; i < n; i++) {
      const lbl = labels[i]; if (lbl < 0) continue; sz[lbl]++
      if (slopeDeg[i] > 2) {
        const rad = azimuthDeg[i] * Math.PI / 180
        sinS[lbl] += Math.sin(rad); cosS[lbl] += Math.cos(rad)
        slpS[lbl] += slopeDeg[i]; cnt[lbl]++
      }
    }
    const avgAz = new Float32Array(nxt), avgSlp = new Float32Array(nxt)
    for (let l = 0; l < nxt; l++) {
      if (cnt[l] > 0) {
        avgAz[l] = Math.atan2(sinS[l], cosS[l]) * 180 / Math.PI
        if (avgAz[l] < 0) avgAz[l] += 360
        avgSlp[l] = slpS[l] / cnt[l]
      }
    }
    return { sz, avgAz, avgSlp }
  }

  let merged = true
  while (merged) {
    merged = false
    const { sz, avgAz, avgSlp } = computeNormalStats()
    for (let lbl = 0; lbl < nxt; lbl++) {
      if (!sz[lbl] || sz[lbl] >= MIN_PX) continue
      const nb = {}
      for (let i = 0; i < n; i++) {
        if (labels[i] !== lbl) continue
        const x = i % w, y = (i - x) / w
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx2 = x + dx, ny2 = y + dy
          if (nx2 >= 0 && nx2 < w && ny2 >= 0 && ny2 < h) {
            const nl = labels[ny2 * w + nx2]
            if (nl >= 0 && nl !== lbl) nb[nl] = (nb[nl] || 0) + 1
          }
        }
      }
      let best = -1, bestSim = -Infinity
      for (const [k, v] of Object.entries(nb)) {
        const nk = +k
        let azDiff = Math.abs(avgAz[lbl] - avgAz[nk])
        if (azDiff > 180) azDiff = 360 - azDiff
        const slopeDiff = Math.abs(avgSlp[lbl] - avgSlp[nk])
        const sim = v - azDiff * 0.1 - slopeDiff * 0.5
        if (sim > bestSim) { bestSim = sim; best = nk }
      }
      if (best >= 0) { for (let i = 0; i < n; i++) if (labels[i] === lbl) labels[i] = best; merged = true }
    }
  }

  // Pass 2: merge adjacent facets with similar normals (union-find)
  {
    const { sz, avgAz, avgSlp } = computeNormalStats()

    const adjPairs = new Map()
    const adjBarrier = new Map()
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (labels[i] < 0) continue
      const lbl = labels[i]
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx2 = x + dx, ny2 = y + dy
        if (nx2 >= w || ny2 >= h) continue
        const nl = labels[ny2 * w + nx2]
        if (nl >= 0 && nl !== lbl) {
          const a = Math.min(lbl, nl), b = Math.max(lbl, nl), key = `${a},${b}`
          adjPairs.set(key, (adjPairs.get(key) || 0) + 1)
          if (barrier[i] || barrier[ny2 * w + nx2]) adjBarrier.set(key, (adjBarrier.get(key) || 0) + 1)
        }
      }
    }

    const par = Array.from({ length: nxt }, (_, i) => i)
    const ufSz = Int32Array.from(sz)
    function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x] } return x }
    function unite(a, b) {
      const ra = find(a), rb = find(b); if (ra === rb) return
      if (ufSz[ra] >= ufSz[rb]) { par[rb] = ra; ufSz[ra] += ufSz[rb] }
      else { par[ra] = rb; ufSz[rb] += ufSz[ra] }
    }

    for (const [key, boundaryLen] of adjPairs) {
      const [aS, bS] = key.split(',')
      const a = +aS, b = +bS
      if (sz[a] < 1 || sz[b] < 1) continue
      if (find(a) === find(b)) continue

      const barrierLen = adjBarrier.get(key) || 0
      if (boundaryLen > 3 && barrierLen / boundaryLen > 0.15) continue

      const bothFlat = avgSlp[a] < 5 && avgSlp[b] < 5
      if (bothFlat) { unite(a, b); continue }

      let azDiff = Math.abs(avgAz[a] - avgAz[b])
      if (azDiff > 180) azDiff = 360 - azDiff
      const slopeDiff = Math.abs(avgSlp[a] - avgSlp[b])
      if (azDiff < AZ_BIN && slopeDiff < P_BIN) unite(a, b)
    }

    for (let i = 0; i < n; i++) if (labels[i] >= 0) labels[i] = find(labels[i])
  }

  // Compact relabel
  const uq = [...new Set(Array.from(labels).filter(l => l >= 0))].sort((a, b) => a - b)
  const lm = new Map(); uq.forEach((l, i) => lm.set(l, i))
  for (let i = 0; i < n; i++) labels[i] = labels[i] >= 0 ? (lm.get(labels[i]) ?? -1) : -1
  const numF = uq.length

  const facets = []
  for (let f = 0; f < numF; f++) {
    let sx = 0, sy = 0, cnt2 = 0, sinA = 0, cosA = 0, sS = 0, sC = 0, sE = 0, eC = 0
    for (let i = 0; i < n; i++) {
      if (labels[i] !== f) continue
      const x = i % w, y = (i - x) / w
      sx += x; sy += y; cnt2++
      if (!isNaN(elev[i])) { sE += elev[i]; eC++ }
      if (slopeDeg[i] > 2) {
        const rad = azimuthDeg[i] * Math.PI / 180
        sinA += Math.sin(rad); cosA += Math.cos(rad); sS += slopeDeg[i]; sC++
      }
    }
    if (cnt2 < 3) { for (let i = 0; i < n; i++) if (labels[i] === f) labels[i] = -1; continue }
    let avgAzF = Math.atan2(sinA, cosA) * 180 / Math.PI
    if (avgAzF < 0) avgAzF += 360
    facets.push({
      id: f, pixelCount: cnt2,
      centroid: { x: Math.round(sx / cnt2), y: Math.round(sy / cnt2) },
      slopeDeg: sC > 0 ? sS / sC : 0, azimuthDeg: avgAzF,
      avgElev: eC > 0 ? sE / eC : 0,
      areaSqFt: 0, pitchDeg: 0, solarMatch: null,
    })
  }
  return { labels, facets, numFacets: numF }
}

/* ── Solar-segment-driven segmentation ────────────────────────── */

function segmentFromSolar(elev, mask, normals, w, h, pxM, solarSegs, geoRef) {
  if (!solarSegs?.length || !geoRef) return null
  const n = w * h, { slopeDeg, azimuthDeg } = normals

  const centers = solarSegs.map((s, idx) => {
    if (!s.center) return null
    const px = Math.round((s.center.longitude - geoRef.origin[0]) / geoRef.res[0])
    const py = Math.round((s.center.latitude - geoRef.origin[1]) / geoRef.res[1])
    if (px < 0 || px >= w || py < 0 || py >= h) return null
    if (!mask[py * w + px]) {
      let bestD = Infinity, bx = px, by = py
      for (let dy = -15; dy <= 15; dy++) for (let dx = -15; dx <= 15; dx++) {
        const nx = px + dx, ny = py + dy
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || !mask[ny * w + nx]) continue
        const d = dx * dx + dy * dy
        if (d < bestD) { bestD = d; bx = nx; by = ny }
      }
      if (bestD === Infinity) return null
      return { px: bx, py: by, seg: s, idx }
    }
    return { px, py, seg: s, idx }
  }).filter(Boolean)

  if (centers.length < 2) return null

  const labels = new Int32Array(n).fill(-1)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (!mask[i]) continue
    let bestScore = -Infinity, bestL = -1
    const pS = slopeDeg[i], pA = azimuthDeg[i], isFlat = pS < 5
    for (let c = 0; c < centers.length; c++) {
      const dx = x - centers[c].px, dy = y - centers[c].py
      const dist = Math.sqrt(dx * dx + dy * dy)
      const seg = centers[c].seg
      const sDiff = Math.abs(pS - (seg.pitchDegrees || 0))
      let aDiff = Math.abs(pA - (seg.azimuthDegrees || 0))
      if (aDiff > 180) aDiff = 360 - aDiff
      const score = isFlat || (seg.pitchDegrees || 0) < 5
        ? -(dist * 1.0 + sDiff * 0.5)
        : -(dist * 0.2 + sDiff * 2.0 + aDiff * 0.8)
      if (score > bestScore) { bestScore = score; bestL = c }
    }
    labels[i] = bestL
  }

  const counts = new Map()
  for (let i = 0; i < n; i++) if (labels[i] >= 0) counts.set(labels[i], (counts.get(labels[i]) || 0) + 1)
  for (let i = 0; i < n; i++) if (labels[i] >= 0 && (counts.get(labels[i]) || 0) < 10) labels[i] = -1

  let changed = true
  while (changed) {
    changed = false
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!mask[i] || labels[i] >= 0) continue
      for (const [ddx, ddy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + ddx, ny = y + ddy
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        if (labels[ny * w + nx] >= 0) { labels[i] = labels[ny * w + nx]; changed = true; break }
      }
    }
  }

  const uq = [...new Set(Array.from(labels).filter(l => l >= 0))].sort((a, b) => a - b)
  const lm = new Map(); uq.forEach((l, i) => lm.set(l, i))
  const origMap = new Map(); uq.forEach((l, i) => origMap.set(i, l))
  for (let i = 0; i < n; i++) labels[i] = labels[i] >= 0 ? (lm.get(labels[i]) ?? -1) : -1
  const numF = uq.length

  const facets = []
  for (let f = 0; f < numF; f++) {
    const origIdx = origMap.get(f)
    const center = centers[origIdx]
    if (!center) continue
    let sx = 0, sy = 0, cnt = 0, sinA = 0, cosA = 0, sS = 0, sC = 0, sE = 0, eC = 0
    for (let i = 0; i < n; i++) {
      if (labels[i] !== f) continue
      const x = i % w, y = (i - x) / w
      sx += x; sy += y; cnt++
      if (!isNaN(elev[i])) { sE += elev[i]; eC++ }
      if (slopeDeg[i] > 2) {
        const rad = azimuthDeg[i] * Math.PI / 180
        sinA += Math.sin(rad); cosA += Math.cos(rad); sS += slopeDeg[i]; sC++
      }
    }
    if (cnt < 3) continue
    const seg = center.seg
    let avgAz = Math.atan2(sinA, cosA) * 180 / Math.PI
    if (avgAz < 0) avgAz += 360
    facets.push({
      id: f, pixelCount: cnt,
      centroid: { x: Math.round(sx / cnt), y: Math.round(sy / cnt) },
      slopeDeg: sC > 0 ? sS / sC : (seg.pitchDegrees || 0),
      azimuthDeg: seg.azimuthDegrees ?? avgAz,
      avgElev: eC > 0 ? sE / eC : 0,
      areaSqFt: Math.round((seg.stats?.areaMeters2 || 0) * SQM_SQFT),
      pitchDeg: seg.pitchDegrees || (sC > 0 ? sS / sC : 0),
      solarMatch: seg,
    })
  }

  return facets.length >= 2 ? { labels, facets, numFacets: numF } : null
}

/* ── Match facets to Google Solar roofSegmentStats ────────────── */

function matchSolarSegments(facets, solarSegs, geoRef, w, h, pxM) {
  if (!solarSegs?.length || !geoRef) {
    for (const f of facets) {
      f.pitchDeg = f.slopeDeg
      f.areaSqFt = Math.round(f.pixelCount * pxM * pxM * SQM_SQFT / Math.max(0.5, Math.cos(f.slopeDeg * Math.PI / 180)))
    }
    return
  }
  const sPx = solarSegs.map(s => {
    if (!s.center) return null
    const px = Math.round((s.center.longitude - geoRef.origin[0]) / geoRef.res[0])
    const py = Math.round((s.center.latitude - geoRef.origin[1]) / geoRef.res[1])
    return (px >= 0 && px < w && py >= 0 && py < h) ? { px, py, seg: s } : null
  }).filter(Boolean)

  for (const f of facets) {
    let best = -1, bd = Infinity
    for (let i = 0; i < sPx.length; i++) {
      const dx = f.centroid.x - sPx[i].px, dy = f.centroid.y - sPx[i].py
      const d = dx * dx + dy * dy
      if (d < bd) { bd = d; best = i }
    }
    if (best >= 0 && bd < (w * h) / 4) {
      const ss = sPx[best].seg
      f.solarMatch = ss
      f.pitchDeg = ss.pitchDegrees || f.slopeDeg
      f.azimuthDeg = ss.azimuthDegrees ?? f.azimuthDeg
      const solarArea = Math.round((ss.stats?.areaMeters2 || 0) * SQM_SQFT)
      const pixelArea = Math.round(f.pixelCount * pxM * pxM * SQM_SQFT / Math.max(0.5, Math.cos(f.slopeDeg * Math.PI / 180)))
      f.areaSqFt = solarArea > 0 ? Math.round((solarArea + pixelArea) / 2) : pixelArea
    } else {
      f.pitchDeg = f.slopeDeg
      f.areaSqFt = Math.round(f.pixelCount * pxM * pxM * SQM_SQFT / Math.max(0.5, Math.cos(f.slopeDeg * Math.PI / 180)))
    }
  }
}

/* ── Douglas-Peucker line simplification ─────────────────────── */

function douglasPeucker(pts, tol) {
  if (pts.length <= 2) return pts
  const s = pts[0], e = pts[pts.length - 1]
  const dx = e.x - s.x, dy = e.y - s.y, len = Math.sqrt(dx * dx + dy * dy) || 1
  let maxD = 0, maxI = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i].x - s.x) * dy - (pts[i].y - s.y) * dx) / len
    if (d > maxD) { maxD = d; maxI = i }
  }
  if (maxD > tol) {
    const left = douglasPeucker(pts.slice(0, maxI + 1), tol)
    const right = douglasPeucker(pts.slice(maxI), tol)
    return left.slice(0, -1).concat(right)
  }
  return [s, e]
}

/* ── Polygon rectification (snap edges to dominant ortho directions) ── */

function rectifyPolygon(pts, snapDeg = 90) {
  if (pts.length < 4) return pts
  const n = pts.length, step = snapDeg * Math.PI / 180

  const edgeData = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y
    const len = Math.sqrt(dx * dx + dy * dy)
    edgeData.push({ len, angle: Math.atan2(dy, dx), mx: (pts[i].x + pts[j].x) / 2, my: (pts[i].y + pts[j].y) / 2 })
  }

  let s2 = 0, c2 = 0
  for (const e of edgeData) { s2 += e.len * Math.sin(2 * e.angle); c2 += e.len * Math.cos(2 * e.angle) }
  const dom = Math.atan2(s2, c2) / 2

  const snapped = edgeData.map(e => {
    let best = dom, bd = Infinity
    for (let k = -4; k <= 4; k++) {
      const c = dom + k * step
      let d = e.angle - c
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      if (Math.abs(d) < bd) { bd = Math.abs(d); best = c }
    }
    return { ...e, sa: best }
  })

  const result = []
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n
    const e1 = snapped[prev], e2 = snapped[i]
    const s1 = Math.sin(e1.sa), c1 = Math.cos(e1.sa)
    const s2b = Math.sin(e2.sa), c2b = Math.cos(e2.sa)
    const a1 = -s1, b1 = c1, d1 = -s1 * e1.mx + c1 * e1.my
    const a2 = -s2b, b2 = c2b, d2 = -s2b * e2.mx + c2b * e2.my
    const det = a1 * b2 - a2 * b1
    if (Math.abs(det) < 1e-8) { result.push({ x: pts[i].x, y: pts[i].y }); continue }
    const ix = (d1 * b2 - d2 * b1) / det, iy = (a1 * d2 - a2 * d1) / det
    const dist = Math.sqrt((ix - pts[i].x) ** 2 + (iy - pts[i].y) ** 2)
    result.push(dist < 15 ? { x: ix, y: iy } : { x: pts[i].x, y: pts[i].y })
  }

  const cl = [result[0]]
  for (let i = 1; i < result.length; i++) {
    const l = cl[cl.length - 1], dx = result[i].x - l.x, dy = result[i].y - l.y
    if (dx * dx + dy * dy > 4) cl.push(result[i])
  }
  return cl.length >= 3 ? cl : pts
}

/* ── Edge extraction helpers ─────────────────────────────────── */

function cc8(points) {
  const pm = new Map()
  for (const p of points) pm.set(`${p.x},${p.y}`, p)
  const vis = new Set(), comps = []
  for (const p of points) {
    const k = `${p.x},${p.y}`
    if (vis.has(k)) continue
    const comp = [], q = [p]; vis.add(k)
    while (q.length) {
      const c = q.shift(); comp.push(c)
      for (const [dx, dy] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
        const nk = `${c.x + dx},${c.y + dy}`
        if (!vis.has(nk) && pm.has(nk)) { vis.add(nk); q.push(pm.get(nk)) }
      }
    }
    comps.push(comp)
  }
  return comps
}

function orderPts(pts) {
  if (pts.length <= 2) return pts
  let md = 0, ai = 0, bi = 0
  const lim = Math.min(pts.length, 500)
  for (let i = 0; i < lim; i++) for (let j = i + 1; j < lim; j++) {
    const d = (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2
    if (d > md) { md = d; ai = i; bi = j }
  }
  const ax = pts[ai].x, ay = pts[ai].y, ux = pts[bi].x - ax, uy = pts[bi].y - ay
  return pts.slice().sort((a, b) => ((a.x - ax) * ux + (a.y - ay) * uy) - ((b.x - ax) * ux + (b.y - ay) * uy))
}

/* ── Phase 4: Curvature-based edge classification ────────────── */

function classifyEdge(labelA, labelB, facets, bPts, elev, mask, w, h, pxM, ridgeMap, valleyMap) {
  const n = w * h
  if (labelA === -1 || labelB === -1) {
    const fl = labelA === -1 ? labelB : labelA
    const f = facets.find(fc => fc.id === fl)
    if (!f || bPts.length < 2) return 'eave'

    let higherCount = 0, totalChecked = 0
    for (const p of bPts) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = p.x + dx, ny = p.y + dy
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        const ni = ny * w + nx
        if (!mask[ni] && !isNaN(elev[ni]) && elev[ni] > -500) {
          totalChecked++
          const pi = p.y * w + p.x
          if (!isNaN(elev[pi]) && elev[ni] > elev[pi] + 0.3) higherCount++
        }
      }
    }
    if (totalChecked > 0 && higherCount / totalChecked > 0.3) {
      const s = bPts[0], e = bPts[bPts.length - 1]
      const si = s.y * w + s.x, ei = e.y * w + e.x
      const dz = (!isNaN(elev[si]) && !isNaN(elev[ei])) ? Math.abs(elev[ei] - elev[si]) : 0
      return dz > 0.3 ? 'step' : 'wall'
    }

    const s = bPts[0], e = bPts[bPts.length - 1]
    const si = s.y * w + s.x, ei = e.y * w + e.x
    if (!isNaN(elev[si]) && !isNaN(elev[ei]) && bPts.length >= 2) {
      const dz = Math.abs(elev[ei] - elev[si])
      const edx = e.x - s.x, edy = e.y - s.y
      const dist2d = Math.sqrt(edx * edx + edy * edy) * pxM
      if (dist2d > 0.3 && dz / dist2d > 0.15) return 'rake'
    }
    return 'eave'
  }

  const fA = facets.find(fc => fc.id === labelA), fB = facets.find(fc => fc.id === labelB)
  if (!fA || !fB) return 'ridge'

  let bE = 0, bc = 0
  for (const p of bPts) {
    const idx = p.y * w + p.x
    if (idx >= 0 && idx < elev.length && !isNaN(elev[idx])) { bE += elev[idx]; bc++ }
  }
  bE = bc > 0 ? bE / bc : 0
  const maxAvg = Math.max(fA.avgElev, fB.avgElev)
  const minAvg = Math.min(fA.avgElev, fB.avgElev)
  const midAvg = (fA.avgElev + fB.avgElev) / 2

  let ridgeOv = 0, valleyOv = 0, total = 0
  for (const p of bPts) {
    const idx = p.y * w + p.x
    if (idx < 0 || idx >= n) continue
    total++
    if (ridgeMap?.[idx]) ridgeOv++
    if (valleyMap?.[idx]) valleyOv++
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = p.x + dx, ny = p.y + dy
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const ni = ny * w + nx
      if (ridgeMap?.[ni]) ridgeOv += 0.5
      if (valleyMap?.[ni]) valleyOv += 0.5
    }
  }
  const ridgeFrac = total > 0 ? ridgeOv / (total * 3) : 0
  const valleyFrac = total > 0 ? valleyOv / (total * 3) : 0

  const edgeSlopeCheck = () => {
    const si = bPts[0].y * w + bPts[0].x
    const ei = bPts[bPts.length - 1].y * w + bPts[bPts.length - 1].x
    const sE = (si >= 0 && si < n && !isNaN(elev[si])) ? elev[si] : 0
    const eE = (ei >= 0 && ei < n && !isNaN(elev[ei])) ? elev[ei] : 0
    const dzEdge = Math.abs(sE - eE)
    const eDx = (bPts[bPts.length - 1].x - bPts[0].x) * pxM
    const eDy = (bPts[bPts.length - 1].y - bPts[0].y) * pxM
    const eLen = Math.sqrt(eDx * eDx + eDy * eDy)
    return eLen > 0.5 ? dzEdge / eLen : 0
  }

  if (ridgeFrac > 0.12 && ridgeFrac > valleyFrac) {
    return edgeSlopeCheck() < 0.12 ? 'ridge' : 'hip'
  }
  if (valleyFrac > 0.12 && valleyFrac > ridgeFrac && bE < minAvg) return 'valley'

  let azD = Math.abs(fA.azimuthDeg - fB.azimuthDeg)
  if (azD > 180) azD = 360 - azD

  if (bE > maxAvg) return edgeSlopeCheck() < 0.12 ? 'ridge' : 'hip'
  if (bE < minAvg) return 'valley'

  if (azD > 45) return 'hip'
  return bE >= midAvg ? 'ridge' : 'valley'
}

/* ── Phase 5: RANSAC line fitting + endpoint snapping ────────── */

function projectOntoLine(p, a, b, c) {
  const d = a * p.x + b * p.y + c
  return { x: p.x - d * a, y: p.y - d * b }
}

function ransacFitLine(points) {
  if (points.length < 3) return { start: points[0], end: points[points.length - 1], a: 0, b: 0, c: 0 }
  const ITERS = 80, THRESH = 1.5
  let bestInliers = 0, bestA = 0, bestB = 0, bestC = 0
  for (let it = 0; it < ITERS; it++) {
    const i1 = Math.floor(Math.random() * points.length)
    let i2 = Math.floor(Math.random() * (points.length - 1))
    if (i2 >= i1) i2++
    const p1 = points[i1], p2 = points[i2]
    const a = p2.y - p1.y, b = p1.x - p2.x
    const len = Math.sqrt(a * a + b * b)
    if (len < 0.001) continue
    const an = a / len, bn = b / len, cn = -(an * p1.x + bn * p1.y)
    let inliers = 0
    for (const p of points) { if (Math.abs(an * p.x + bn * p.y + cn) < THRESH) inliers++ }
    if (inliers > bestInliers) { bestInliers = inliers; bestA = an; bestB = bn; bestC = cn }
  }
  const projS = projectOntoLine(points[0], bestA, bestB, bestC)
  const projE = projectOntoLine(points[points.length - 1], bestA, bestB, bestC)
  return { start: projS, end: projE, a: bestA, b: bestB, c: bestC }
}

function lineIntersection(a1, b1, c1, a2, b2, c2) {
  const det = a1 * b2 - a2 * b1
  if (Math.abs(det) < 1e-8) return null
  return { x: (b1 * c2 - b2 * c1) / det, y: (a2 * c1 - a1 * c2) / det }
}

function snapEndpoints(edges, tolerance) {
  const tol2 = tolerance * tolerance
  const endpoints = []
  for (let i = 0; i < edges.length; i++) {
    if (!edges[i].fitted) continue
    endpoints.push({ ei: i, which: 'start', pt: edges[i].fitted.start })
    endpoints.push({ ei: i, which: 'end', pt: edges[i].fitted.end })
  }
  const assigned = new Set()
  const clusters = []
  for (let i = 0; i < endpoints.length; i++) {
    if (assigned.has(i)) continue
    const cluster = [i]; assigned.add(i)
    for (let j = i + 1; j < endpoints.length; j++) {
      if (assigned.has(j)) continue
      const dx = endpoints[i].pt.x - endpoints[j].pt.x, dy = endpoints[i].pt.y - endpoints[j].pt.y
      if (dx * dx + dy * dy < tol2) { cluster.push(j); assigned.add(j) }
    }
    if (cluster.length > 1) clusters.push(cluster)
  }
  for (const cluster of clusters) {
    let sx = 0, sy = 0
    for (const idx of cluster) { sx += endpoints[idx].pt.x; sy += endpoints[idx].pt.y }
    const avg = { x: sx / cluster.length, y: sy / cluster.length }
    if (cluster.length === 2) {
      const e1 = edges[endpoints[cluster[0]].ei], e2 = edges[endpoints[cluster[1]].ei]
      if (e1.fitted && e2.fitted && e1.fitted.a !== undefined && e2.fitted.a !== undefined) {
        const inter = lineIntersection(e1.fitted.a, e1.fitted.b, e1.fitted.c, e2.fitted.a, e2.fitted.b, e2.fitted.c)
        if (inter) {
          const d0 = (inter.x - avg.x) ** 2 + (inter.y - avg.y) ** 2
          if (d0 < tol2 * 4) { avg.x = inter.x; avg.y = inter.y }
        }
      }
    }
    for (const idx of cluster) {
      const ep = endpoints[idx], e = edges[ep.ei]
      if (ep.which === 'start') e.fitted.start = { ...avg }
      else e.fitted.end = { ...avg }
    }
  }
}

/* ── Edge extraction + classification + RANSAC ───────────────── */

function extractEdges(labels, elev, facets, mask, w, h, pxM, ridgeMap, valleyMap) {
  const n = w * h, pairs = new Map()
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (!mask[i]) continue
    const ml = labels[i]
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx2 = x + dx, ny2 = y + dy
      let nl = -1
      if (nx2 >= 0 && nx2 < w && ny2 >= 0 && ny2 < h && mask[ny2 * w + nx2]) nl = labels[ny2 * w + nx2]
      if (nl !== ml) {
        const a = Math.min(ml, nl), b = Math.max(ml, nl), key = `${a},${b}`
        if (!pairs.has(key)) pairs.set(key, [])
        pairs.get(key).push({ x, y })
      }
    }
  }

  const edges = []
  for (const [key, pts] of pairs) {
    const [aS, bS] = key.split(',')
    const lA = +aS, lB = +bS
    const seen = new Set(), uniq = []
    for (const p of pts) { const k = `${p.x},${p.y}`; if (!seen.has(k)) { seen.add(k); uniq.push(p) } }
    if (uniq.length < 2) continue
    const comps = cc8(uniq)
    const isExterior = lA === -1 || lB === -1

    for (const comp of comps) {
      if (comp.length < 2) continue
      const ordered = orderPts(comp)
      const simplified = douglasPeucker(ordered, 2.0)
      if (simplified.length < 2) continue

      if (isExterior && simplified.length >= 3) {
        for (let j = 0; j < simplified.length - 1; j++) {
          const p0 = simplified[j], p1 = simplified[j + 1]
          const ddx = (p1.x - p0.x) * pxM, ddy = (p1.y - p0.y) * pxM
          const i0 = p0.y * w + p0.x, i1 = p1.y * w + p1.x
          const dz = (i0 >= 0 && i0 < n && i1 >= 0 && i1 < n && !isNaN(elev[i0]) && !isNaN(elev[i1])) ? elev[i1] - elev[i0] : 0
          const segLen = Math.sqrt(ddx * ddx + ddy * ddy + dz * dz) * M_FT
          if (segLen < 2.0) continue
          const segPts = [p0, p1]
          const type = classifyEdge(lA, lB, facets, segPts, elev, mask, w, h, pxM, ridgeMap, valleyMap)
          const a = p1.y - p0.y, b = p0.x - p1.x
          const len = Math.sqrt(a * a + b * b)
          const fitted = len > 0.001
            ? { start: { ...p0 }, end: { ...p1 }, a: a / len, b: b / len, c: -(a / len * p0.x + b / len * p0.y) }
            : { start: { ...p0 }, end: { ...p1 }, a: 0, b: 0, c: 0 }
          edges.push({
            type, facetA: lA, facetB: lB, points: segPts,
            lengthFt: Math.round(segLen), lengthFtRaw: segLen,
            startPx: p0, endPx: p1,
            midPx: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 },
            fitted,
          })
        }
      } else {
        let lm = 0
        for (let i = 1; i < simplified.length; i++) {
          const p0 = simplified[i - 1], p1 = simplified[i]
          const ddx = (p1.x - p0.x) * pxM, ddy = (p1.y - p0.y) * pxM
          const i0 = p0.y * w + p0.x, i1 = p1.y * w + p1.x
          const dz = (i0 >= 0 && i0 < n && i1 >= 0 && i1 < n && !isNaN(elev[i0]) && !isNaN(elev[i1])) ? elev[i1] - elev[i0] : 0
          lm += Math.sqrt(ddx * ddx + ddy * ddy + dz * dz)
        }
        const ftRaw = lm * M_FT
        if (ftRaw < 2.0) continue
        const type = classifyEdge(lA, lB, facets, ordered, elev, mask, w, h, pxM, ridgeMap, valleyMap)
        const fitted = ransacFitLine(simplified)
        const s = simplified[0], e = simplified[simplified.length - 1], m = simplified[Math.floor(simplified.length / 2)]
        edges.push({ type, facetA: lA, facetB: lB, points: simplified, lengthFt: Math.round(ftRaw), lengthFtRaw: ftRaw, startPx: s, endPx: e, midPx: m, fitted })
      }
    }
  }

  snapEndpoints(edges, 4.0)
  return edges
}

/* ── 3D measurements from edges ──────────────────────────────── */

function compute3DMeasurements(edges) {
  const totals = {
    ridge: { ft: 0, raw: 0, count: 0 }, eave: { ft: 0, raw: 0, count: 0 },
    rake: { ft: 0, raw: 0, count: 0 }, hip: { ft: 0, raw: 0, count: 0 },
    valley: { ft: 0, raw: 0, count: 0 }, wall: { ft: 0, raw: 0, count: 0 },
    step: { ft: 0, raw: 0, count: 0 },
  }
  for (const e of edges) {
    const t = totals[e.type]
    if (t) { t.ft += e.lengthFt; t.raw += e.lengthFtRaw; t.count++ }
  }
  return {
    totals,
    derived: {
      drip: totals.eave.ft + totals.rake.ft,
      dripRaw: totals.eave.raw + totals.rake.raw,
      step: totals.step.ft,
      stepRaw: totals.step.raw,
      flash: totals.wall.ft,
      flashRaw: totals.wall.raw,
      leakBarrier: totals.eave.ft + totals.hip.ft + totals.rake.ft + totals.valley.ft + totals.wall.ft + totals.step.ft,
      leakBarrierRaw: totals.eave.raw + totals.hip.raw + totals.rake.raw + totals.valley.raw + totals.wall.raw + totals.step.raw,
      ridgeCap: totals.ridge.ft + totals.hip.ft,
      ridgeCapRaw: totals.ridge.raw + totals.hip.raw,
      starter: totals.eave.ft + totals.rake.ft,
      starterRaw: totals.eave.raw + totals.rake.raw,
    },
  }
}

/* ── Phase 6: Build facet polygons from edge graph ───────────── */

function buildFacetPolygonsFromEdges(facets, edges, buildingOutline, labels, w, h) {
  const outlinePts = (buildingOutline || []).map(p => {
    const px = Math.round(p.x), py = Math.round(p.y)
    const fids = new Set()
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = px + dx, ny = py + dy
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const idx = ny * w + nx
      if (labels[idx] >= 0) fids.add(labels[idx])
    }
    return { x: p.x, y: p.y, fids: [...fids] }
  })

  for (const f of facets) {
    const pts = []
    const fEdges = edges.filter(e => (e.facetA === f.id || e.facetB === f.id) && e.fitted)
    for (const e of fEdges) { pts.push(e.fitted.start, e.fitted.end) }
    for (const op of outlinePts) { if (op.fids.includes(f.id)) pts.push({ x: op.x, y: op.y }) }
    const uniq = []
    for (const p of pts) {
      let found = false
      for (const u of uniq) { if ((p.x - u.x) ** 2 + (p.y - u.y) ** 2 < 4) { found = true; break } }
      if (!found) uniq.push({ ...p })
    }
    if (uniq.length < 3) continue
    const cx = uniq.reduce((s, p) => s + p.x, 0) / uniq.length
    const cy = uniq.reduce((s, p) => s + p.y, 0) / uniq.length
    uniq.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
    f.polygon = uniq
  }
}

/* ── Per-facet boundary tracing (Moore contour) — fallback ───── */

function traceFacetOutline(labels, fid, w, h) {
  const peri = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (labels[i] !== fid) continue
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || nx >= w || ny < 0 || ny >= h || labels[ny * w + nx] !== fid) { peri[i] = 1; break }
    }
  }
  let start = -1
  for (let i = 0; i < w * h; i++) if (peri[i]) { start = i; break }
  if (start < 0) return []
  const dx8 = [1, 1, 0, -1, -1, -1, 0, 1], dy8 = [0, 1, 1, 1, 0, -1, -1, -1]
  const chain = [], vis = new Uint8Array(w * h)
  let curr = start, pd = 7, lim = w * h
  do {
    const cx = curr % w, cy = (curr - cx) / w
    chain.push({ x: cx, y: cy }); vis[curr] = 1
    let found = false
    const sd = (pd + 6) % 8
    for (let d = 0; d < 8; d++) {
      const dir = (sd + d) % 8, nx = cx + dx8[dir], ny = cy + dy8[dir]
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const ni = ny * w + nx
      if (peri[ni] && (!vis[ni] || (ni === start && chain.length > 4))) { curr = ni; pd = dir; found = true; break }
    }
    if (!found) break
  } while (curr !== start && --lim > 0)
  return douglasPeucker(chain, 3.0)
}

/* ── Orchestrator: full roof analysis ────────────────────────── */

function analyzeRoof(dsm, mask, w, h, pxM, solarSegs, geoRef) {
  const n = w * h, rawElev = new Float32Array(n)
  let bPx = 0
  for (let i = 0; i < n; i++) {
    if (mask[i]) { const v = dsm[i]; if (v < -500 || v > 9000) { rawElev[i] = NaN; continue }; rawElev[i] = v; bPx++ }
    else rawElev[i] = NaN
  }
  if (bPx < 20) return null

  const elev = smoothDSM(rawElev, mask, w, h)
  const { ridgeMap, valleyMap } = detectCurvature(elev, mask, w, h, pxM)
  const normals = computeNormals(elev, mask, w, h, pxM)

  let segResult = segmentFromSolar(elev, mask, normals, w, h, pxM, solarSegs, geoRef)
  if (!segResult) {
    segResult = segmentFacets(elev, mask, normals, w, h, ridgeMap, valleyMap)
    matchSolarSegments(segResult.facets, solarSegs, geoRef, w, h, pxM)
  }
  const { labels, facets } = segResult

  const edges = extractEdges(labels, elev, facets, mask, w, h, pxM, ridgeMap, valleyMap)
  const { totals, derived } = compute3DMeasurements(edges)

  let bx0 = w, bx1 = 0, by0 = h, by1 = 0
  for (let i = 0; i < n; i++) if (mask[i]) {
    const x = i % w, y = (i - x) / w
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y
  }

  const bldgLabels = new Int32Array(n).fill(-1)
  for (let i = 0; i < n; i++) if (mask[i]) bldgLabels[i] = 9999
  const rawBldgOutline = traceFacetOutline(bldgLabels, 9999, w, h)
  const buildingOutline = rectifyPolygon(rawBldgOutline, 90)

  buildFacetPolygonsFromEdges(facets, edges, buildingOutline, labels, w, h)
  for (const f of facets) {
    if (!f.polygon || f.polygon.length < 3) {
      const raw = traceFacetOutline(labels, f.id, w, h)
      f.outline = raw.length >= 4 ? rectifyPolygon(raw, 45) : raw
    } else {
      f.outline = f.polygon
    }
  }

  return { facets, edges, labels, totals, derived, bounds: { bx0, bx1, by0, by1 }, numFacets: facets.length, buildingOutline }
}

/* ── 2D Diagrams ─────────────────────────────────────────────── */

function compassSvg2d(x, y) {
  return `<circle cx="${x}" cy="${y - 10}" r="12" fill="#1E3A5F" opacity="0.9"/>` +
    `<text x="${x}" y="${y - 5}" fill="white" font-size="12" font-weight="bold" font-family="Arial,sans-serif" text-anchor="middle">N</text>` +
    `<polygon points="${x},${y - 26} ${x - 3},${y - 20} ${x + 3},${y - 20}" fill="white"/>`
}

const FACET_TINTS = [
  [225, 230, 238], [215, 225, 235], [220, 228, 240], [210, 220, 232],
  [218, 226, 236], [212, 222, 234], [222, 230, 240], [216, 224, 234],
  [208, 218, 230], [224, 232, 242], [214, 226, 236], [220, 224, 232],
  [230, 234, 240], [205, 215, 228], [226, 230, 236], [218, 228, 238],
  [210, 224, 236], [222, 226, 234],
]

function diagramLayout(bounds, oW, oH, pad) {
  const { bx0, bx1, by0, by1 } = bounds
  const bW = Math.max(bx1 - bx0, 1), bH = Math.max(by1 - by0, 1)
  const scale = Math.min((oW - pad * 2) / bW, (oH - pad * 2) / bH)
  const resW = Math.max(1, Math.round(bW * scale)), resH = Math.max(1, Math.round(bH * scale))
  const offX = Math.round(pad + (oW - pad * 2 - resW) / 2)
  const offY = Math.round(pad + (oH - pad * 2 - resH) / 2)
  const tx = pt => ({ x: (pt.x - bx0) * scale + offX, y: (pt.y - by0) * scale + offY })
  return { scale, resW, resH, offX, offY, tx }
}

function buildingOutlineSvg(outline, tx) {
  if (!outline || outline.length < 3) return ''
  const pts = outline.map(p => { const t = tx(p); return `${t.x.toFixed(1)},${t.y.toFixed(1)}` }).join(' ')
  return `<polygon points="${pts}" fill="none" stroke="#334155" stroke-width="2" stroke-linejoin="round"/>`
}

function facetPolygonsSvg(facets, tx, colorFn) {
  let svg = ''
  for (const f of facets) {
    if (!f.outline || f.outline.length < 3) continue
    const pts = f.outline.map(p => { const t = tx(p); return `${t.x.toFixed(1)},${t.y.toFixed(1)}` }).join(' ')
    const [r, g, b] = colorFn(f)
    svg += `<polygon points="${pts}" fill="rgb(${r},${g},${b})" stroke="#8899AA" stroke-width="0.5" stroke-linejoin="round"/>`
  }
  return svg
}

async function makeCleanDiagram(roofData) {
  if (!roofData) return null
  const { facets, edges, bounds, buildingOutline } = roofData
  const oW = 800, oH = 600, pad = 60
  const { tx } = diagramLayout(bounds, oW, oH, pad)

  let svg = `<svg width="${oW}" height="${oH}" xmlns="http://www.w3.org/2000/svg">`
  svg += `<rect width="${oW}" height="${oH}" fill="white"/>`
  svg += facetPolygonsSvg(facets, tx, (f) => FACET_TINTS[f.id % FACET_TINTS.length])
  for (const e of (edges || [])) {
    if (!e.fitted) continue
    const s = tx(e.fitted.start), end = tx(e.fitted.end)
    svg += `<line x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="#556677" stroke-width="1.5"/>`
  }
  svg += buildingOutlineSvg(buildingOutline, tx)
  svg += compassSvg2d(oW - 30, 35)
  svg += '</svg>'
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function makeLengthDiagram(roofData) {
  if (!roofData) return null
  const { facets, edges, bounds, buildingOutline } = roofData
  const oW = 800, oH = 600, pad = 60
  const { tx } = diagramLayout(bounds, oW, oH, pad)
  const colors = { eave: '#F97316', rake: '#A855F7', ridge: '#EF4444', valley: '#22C55E', hip: '#3B82F6', wall: '#6B7280', step: '#8B5CF6' }

  let svg = `<svg width="${oW}" height="${oH}" xmlns="http://www.w3.org/2000/svg">`
  svg += `<rect width="${oW}" height="${oH}" fill="white"/>`
  svg += facetPolygonsSvg(facets, tx, (f) => FACET_TINTS[f.id % FACET_TINTS.length])
  svg += buildingOutlineSvg(buildingOutline, tx)
  for (const e of (edges || [])) {
    if (!e.fitted) continue
    const col = colors[e.type] || '#999'
    const s = tx(e.fitted.start), end = tx(e.fitted.end)
    svg += `<line x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`
    const mx = (s.x + end.x) / 2, my = (s.y + end.y) / 2
    const tw = String(e.lengthFt).length * 7 + 8
    svg += `<rect x="${mx - tw / 2}" y="${my - 8}" width="${tw}" height="14" rx="3" fill="white" opacity="0.92"/>`
    svg += `<text x="${mx}" y="${my + 3}" fill="${col}" font-size="10" font-weight="bold" font-family="Arial,sans-serif" text-anchor="middle">${e.lengthFt}</text>`
  }
  svg += compassSvg2d(oW - 30, 35)
  svg += '</svg>'
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function makePitchDiagram(roofData) {
  if (!roofData) return null
  const { facets, edges, bounds, buildingOutline } = roofData
  const oW = 800, oH = 600, pad = 60
  const { tx } = diagramLayout(bounds, oW, oH, pad)

  let svg = `<svg width="${oW}" height="${oH}" xmlns="http://www.w3.org/2000/svg">`
  svg += `<rect width="${oW}" height="${oH}" fill="white"/>`
  svg += facetPolygonsSvg(facets, tx, (f) => {
    const col = pitchHex(f.pitchDeg || f.slopeDeg)
    const [r, g, b] = hexRgb(col)
    return [Math.min(255, r + 60), Math.min(255, g + 60), Math.min(255, b + 60)]
  })
  for (const e of (edges || [])) {
    if (!e.fitted) continue
    const s = tx(e.fitted.start), end = tx(e.fitted.end)
    svg += `<line x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="#556677" stroke-width="1"/>`
  }
  svg += buildingOutlineSvg(buildingOutline, tx)
  for (const f of (facets || [])) {
    const p = tx(f.centroid)
    const rise = pitchRise(f.pitchDeg || f.slopeDeg)
    const col = pitchHex(f.pitchDeg || f.slopeDeg)
    svg += `<rect x="${p.x - 16}" y="${p.y - 9}" width="32" height="16" rx="3" fill="white" opacity="0.9"/>`
    svg += `<text x="${p.x}" y="${p.y + 3}" fill="${col}" font-size="11" font-weight="bold" font-family="Arial,sans-serif" text-anchor="middle">${rise}</text>`
  }
  svg += compassSvg2d(oW - 30, 35)
  svg += '</svg>'
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function makeAreaDiagram(roofData) {
  if (!roofData) return null
  const { facets, edges, bounds, buildingOutline } = roofData
  const oW = 800, oH = 600, pad = 60
  const { tx } = diagramLayout(bounds, oW, oH, pad)

  let svg = `<svg width="${oW}" height="${oH}" xmlns="http://www.w3.org/2000/svg">`
  svg += `<rect width="${oW}" height="${oH}" fill="white"/>`
  svg += facetPolygonsSvg(facets, tx, () => [200, 218, 240])
  for (const e of (edges || [])) {
    if (!e.fitted) continue
    const s = tx(e.fitted.start), end = tx(e.fitted.end)
    svg += `<line x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="#556677" stroke-width="1"/>`
  }
  svg += buildingOutlineSvg(buildingOutline, tx)
  for (const f of (facets || [])) {
    const p = tx(f.centroid)
    const sqft = f.areaSqFt || 0
    const tw = String(sqft).length * 7 + 10
    svg += `<rect x="${p.x - tw / 2}" y="${p.y - 9}" width="${tw}" height="16" rx="3" fill="#3B82F6" opacity="0.85"/>`
    svg += `<text x="${p.x}" y="${p.y + 3}" fill="white" font-size="11" font-weight="bold" font-family="Arial,sans-serif" text-anchor="middle">${sqft.toLocaleString()}</text>`
  }
  svg += compassSvg2d(oW - 30, 35)
  svg += '</svg>'
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/* ── Side view: oblique 3D projection ────────────────────────── */

async function makeSideView(rgbBuf, dsm, mask, w, h, pxM, direction) {
  const rgbData = await sharp(rgbBuf).raw().toBuffer()
  let bx0 = w, bx1 = 0, by0 = h, by1 = 0, minE = Infinity, maxE = -Infinity
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue
    const x = i % w, y = (i - x) / w
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y
    const e = dsm[i]; if (e > -500 && e < 9000) { if (e < minE) minE = e; if (e > maxE) maxE = e }
  }
  if (bx0 >= bx1 || by0 >= by1 || minE === Infinity) return null

  const rotMap = { North: 0, East: Math.PI / 2, South: Math.PI, West: 3 * Math.PI / 2 }
  const rot = rotMap[direction] || 0
  const cosR = Math.cos(rot), sinR = Math.sin(rot)
  const cxb = (bx0 + bx1) / 2, cyb = (by0 + by1) / 2
  const maxSpan = Math.max(bx1 - bx0, by1 - by0) || 1

  const oW = 480, oH = 320
  const out = Buffer.alloc(oW * oH * 3)
  for (let i = 0; i < oW * oH * 3; i += 3) { out[i] = 235; out[i + 1] = 238; out[i + 2] = 242 }
  const zbuf = new Float32Array(oW * oH).fill(Infinity)

  const hScale = oW * 0.6 / maxSpan
  const vScale = hScale * 0.85
  const tilt = 0.35

  for (let py = by0; py <= by1; py++) for (let px = bx0; px <= bx1; px++) {
    const i = py * w + px; if (!mask[i]) continue
    const e = dsm[i]; if (e < -500 || e > 9000) continue
    const cx = px - cxb, cy2 = py - cyb, ez = (e - minE) / pxM
    const rx = cx * cosR - cy2 * sinR, ry = cx * sinR + cy2 * cosR
    const sx = Math.round(rx * hScale + oW / 2)
    const sy = Math.round(-ez * vScale + ry * tilt * hScale + oH * 0.65)
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const px2 = sx + dx, py2 = sy + dy
      if (px2 < 0 || px2 >= oW || py2 < 0 || py2 >= oH) continue
      const oi = py2 * oW + px2
      if (ry < zbuf[oi]) {
        zbuf[oi] = ry; const o3 = oi * 3, i3 = i * 3
        const shade = 0.7 + 0.3 * Math.max(0, Math.min(1, 0.5 + ry / (maxSpan || 1)))
        out[o3] = Math.min(255, Math.round(rgbData[i3] * shade))
        out[o3 + 1] = Math.min(255, Math.round(rgbData[i3 + 1] * shade))
        out[o3 + 2] = Math.min(255, Math.round(rgbData[i3 + 2] * shade))
      }
    }
  }
  return sharp(out, { raw: { width: oW, height: oH, channels: 3 } })
    .resize(240, 160, { kernel: 'lanczos3' }).png().toBuffer()
}

/* ── PDF ─────────────────────────────────────────────────────── */

function drawTable(doc, x, y, headers, rows, colWidths, opts = {}) {
  const rh = opts.rowHeight || 16, pad = 4, fs = opts.fontSize || 8, maxY = PH - MG - 20
  doc.font('Helvetica-Bold').fontSize(fs).fillColor('#333333')
  let cx = x
  for (let i = 0; i < headers.length; i++) {
    doc.save().rect(cx, y, colWidths[i], rh).fill('#E8E8E8').restore()
    doc.rect(cx, y, colWidths[i], rh).strokeColor('#BBBBBB').stroke()
    doc.fillColor('#333333').text(headers[i], cx + pad, y + 4, { width: colWidths[i] - 2 * pad, lineBreak: false })
    cx += colWidths[i]
  }
  doc.font('Helvetica').fontSize(fs)
  let ry = y + rh
  for (let ri = 0; ri < rows.length; ri++) {
    if (ry + rh > maxY) break
    cx = x; const row = rows[ri]
    const bg = opts.highlightRow === ri ? '#FFFBE6' : (ri % 2 === 1 ? '#F9F9F9' : '#FFFFFF')
    for (let i = 0; i < row.length; i++) {
      doc.save().rect(cx, ry, colWidths[i], rh).fill(bg).restore()
      doc.rect(cx, ry, colWidths[i], rh).strokeColor('#DDDDDD').stroke()
      const bold = opts.boldCol === i
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs)
        .fillColor('#333333').text(String(row[i] ?? ''), cx + pad, ry + 4, { width: colWidths[i] - 2 * pad, lineBreak: false })
      cx += colWidths[i]
    }
    ry += rh
  }
  return ry
}

function pageFooter(doc, branding, address, pageNum, totalPages) {
  const y = PH - MG + 5
  doc.font('Helvetica').fontSize(7).fillColor('#999999')
  const left = branding?.companyName ? `Prepared For: ${branding.companyName}` : ''
  if (left) doc.text(left, MG, y, { lineBreak: false })
  doc.text(address || '', MG + (left ? 220 : 0), y, { lineBreak: false })
  doc.text(String(pageNum), PW - MG - 10, y, { lineBreak: false })
}

async function buildPDF({ branding, address, reportDate, totalSqFt, roofData, diagrams, sideViews }) {
  const doc = new PDFDocument({ size: 'letter', margin: MG, bufferPages: true })
  const chunks = []; doc.on('data', c => chunks.push(c))
  const done = new Promise(r => doc.on('end', () => r(Buffer.concat(chunks))))

  const nFacets = roofData?.numFacets || 0
  const tot = roofData?.totals || { ridge: { ft: 0, raw: 0, count: 0 }, eave: { ft: 0, raw: 0, count: 0 }, rake: { ft: 0, raw: 0, count: 0 }, hip: { ft: 0, raw: 0, count: 0 }, valley: { ft: 0, raw: 0, count: 0 }, wall: { ft: 0, raw: 0, count: 0 }, step: { ft: 0, raw: 0, count: 0 } }
  const drv = roofData?.derived || { drip: 0, dripRaw: 0, step: 0, stepRaw: 0, flash: 0, flashRaw: 0, leakBarrier: 0, leakBarrierRaw: 0, ridgeCap: 0, ridgeCapRaw: 0, starter: 0, starterRaw: 0 }
  const facets = roofData?.facets || []

  const predPitchDeg = facets.length ? facets.reduce((a, f) => (f.areaSqFt > a.areaSqFt ? f : a), facets[0]).pitchDeg || facets[0].slopeDeg : 0
  const predPitch = `${pitchRise(predPitchDeg)}/12`
  const ridgesHips = tot.ridge.ft + tot.hip.ft
  const sw = suggestedWaste(nFacets)
  const TOTAL_PAGES = 9

  // PAGE 1 — Overview
  let cy = MG
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#222222').text(address || 'Property Address', MG, cy, { lineBreak: false })
  cy += 18
  doc.font('Helvetica').fontSize(9).fillColor('#666666').text(reportDate, MG, cy, { lineBreak: false })
  cy += 14
  if (branding?.companyName) { doc.font('Helvetica').fontSize(9).fillColor('#666666').text(`Prepared For: ${branding.companyName}`, MG, cy, { lineBreak: false }); cy += 14 }
  cy += 8
  const imgW = CW * 0.52, imgH = 280
  if (diagrams.aerial) { try { doc.image(diagrams.aerial, MG, cy, { fit: [imgW, imgH] }) } catch {} }
  const rx = MG + imgW + 20, ry0 = cy
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#222222').text('Contents', rx, ry0, { lineBreak: false })
  let ry = ry0 + 14
  const tocItems = ['Overview', 'Diagram', 'Top View', 'Side Views', 'Lengths', 'Areas', 'Pitches', 'Summary', 'Materials']
  for (let i = 0; i < tocItems.length; i++) {
    doc.font('Helvetica').fontSize(8).fillColor('#444444').text(tocItems[i], rx, ry, { lineBreak: false }).text(String(i + 1), rx + 120, ry, { lineBreak: false })
    ry += 12
  }
  ry += 14
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#222222').text('Measurements', rx, ry, { lineBreak: false })
  ry += 14
  for (const [lbl, val] of [['Roof Area', `${Math.round(totalSqFt).toLocaleString()} sqft`], ['Roof Facets', `${nFacets} facets`], ['Predominant Pitch', predPitch], ['Ridges/Hips', fmtFtIn(tot.ridge.raw + tot.hip.raw)], ['Valleys', fmtFtIn(tot.valley.raw)], ['Rakes', fmtFtIn(tot.rake.raw)], ['Eaves', fmtFtIn(tot.eave.raw)]]) {
    doc.font('Helvetica').fontSize(8).fillColor('#666666').text(lbl, rx, ry, { lineBreak: false })
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#333333').text(val, rx + 95, ry, { lineBreak: false })
    ry += 13
  }
  if (branding?.logoBase64) { try { const b64 = branding.logoBase64.split(',').pop(); doc.image(Buffer.from(b64, 'base64'), rx, ry + 20, { fit: [CW * 0.35, 50] }) } catch {} }
  pageFooter(doc, branding, address, 1, TOTAL_PAGES)

  // PAGE 2 — Diagram
  doc.addPage()
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#222222').text('Diagram', MG, MG, { lineBreak: false })
  if (diagrams.clean) { try { doc.image(diagrams.clean, MG, MG + 26, { fit: [CW, 560], align: 'center' }) } catch {} }
  pageFooter(doc, branding, address, 2, TOTAL_PAGES)

  // PAGE 3 — Top View
  doc.addPage()
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#222222').text('Top View', MG, MG, { lineBreak: false })
  if (diagrams.aerial) { try { doc.image(diagrams.aerial, MG, MG + 26, { fit: [CW, 560], align: 'center' }) } catch {} }
  doc.font('Helvetica').fontSize(8).fillColor('#999999').text(reportDate, MG, MG + 594, { lineBreak: false })
  pageFooter(doc, branding, address, 3, TOTAL_PAGES)

  // PAGE 4 — Side Views
  doc.addPage()
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#222222').text('Side Views', MG, MG, { lineBreak: false })
  const svLabels = ['North', 'East', 'South', 'West']
  const svPositions = [[MG, MG + 30], [MG + CW / 2 + 10, MG + 30], [MG, MG + 30 + 195], [MG + CW / 2 + 10, MG + 30 + 195]]
  for (let si = 0; si < 4; si++) {
    const [svx, svy] = svPositions[si]
    const svImg = sideViews?.[svLabels[si]]
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#555555').text(svLabels[si], svx, svy, { lineBreak: false })
    if (svImg) { try { doc.image(svImg, svx, svy + 14, { fit: [CW / 2 - 15, 170] }) } catch {} }
    else { doc.font('Helvetica').fontSize(8).fillColor('#aaaaaa').text('View unavailable', svx + 40, svy + 80, { lineBreak: false }) }
  }
  pageFooter(doc, branding, address, 4, TOTAL_PAGES)

  // PAGE 5 — Lengths
  doc.addPage()
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#222222').text('Length measurement report', MG, MG, { lineBreak: false })
  if (diagrams.length) { try { doc.image(diagrams.length, MG, MG + 26, { fit: [CW, 440], align: 'center' }) } catch {} }
  cy = MG + 480
  const edgeColors = { Eaves: '#F97316', Hips: '#3B82F6', Rakes: '#A855F7', Ridges: '#EF4444', Valleys: '#22C55E', 'Wall flashing': '#6B7280', 'Step flashing': '#8B5CF6' }
  let ex = MG
  for (const [lbl, rawVal] of [['Eaves', tot.eave.raw], ['Hips', tot.hip.raw], ['Rakes', tot.rake.raw], ['Ridges', tot.ridge.raw], ['Valleys', tot.valley.raw], ['Wall flashing', tot.wall.raw], ['Step flashing', tot.step.raw]]) {
    if (ex > MG + CW - 80) { cy += 18; ex = MG }
    const [r, g, b] = hexRgb(edgeColors[lbl] || '#999')
    doc.save().rect(ex, cy, 8, 8).fill(`rgb(${r},${g},${b})`).restore()
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#333333').text(`${lbl}: ${fmtFtIn(rawVal)}`, ex + 11, cy + 1, { lineBreak: false })
    ex += 76
  }
  cy += 16
  doc.font('Helvetica').fontSize(6).fillColor('#999999').text('Measurements in diagram are rounded up for display.', MG, cy, { lineBreak: false })
  pageFooter(doc, branding, address, 5, TOTAL_PAGES)

  // PAGE 6 — Areas
  doc.addPage()
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#222222').text('Area measurement report', MG, MG, { lineBreak: false })
  cy = MG + 18
  doc.font('Helvetica').fontSize(8).fillColor('#555555')
  doc.text(`Total roof area: ${Math.round(totalSqFt).toLocaleString()} sqft`, MG, cy, { lineBreak: false })
  doc.text(`Predominant pitch: ${predPitch}`, MG + 200, cy, { lineBreak: false })
  cy += 12
  const pitchedArea = facets.filter(f => (f.pitchDeg || f.slopeDeg) > 3).reduce((s, f) => s + (f.areaSqFt || 0), 0)
  const flatArea = facets.filter(f => (f.pitchDeg || f.slopeDeg) <= 3).reduce((s, f) => s + (f.areaSqFt || 0), 0)
  doc.text(`Pitched roof area: ${pitchedArea.toLocaleString()} sqft`, MG, cy, { lineBreak: false })
  doc.text(`Flat roof area: ${flatArea.toLocaleString()} sqft`, MG + 200, cy, { lineBreak: false })
  cy += 14
  if (diagrams.area) { try { doc.image(diagrams.area, MG, cy, { fit: [CW, 480], align: 'center' }) } catch {} }
  cy += 490
  doc.font('Helvetica').fontSize(6).fillColor('#999999').text('Area measurements in diagram are rounded. The totals are the sums of the exact measurements, which are then rounded.', MG, cy, { lineBreak: false })
  pageFooter(doc, branding, address, 6, TOTAL_PAGES)

  // PAGE 7 — Pitches
  doc.addPage()
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#222222').text('Pitch & direction measurement report', MG, MG, { lineBreak: false })
  if (diagrams.pitch) { try { doc.image(diagrams.pitch, MG, MG + 26, { fit: [CW, 520], align: 'center' }) } catch {} }
  doc.font('Helvetica').fontSize(7).fillColor('#999999').text('Pitches in inches per foot', MG, MG + 560, { lineBreak: false })
  pageFooter(doc, branding, address, 7, TOTAL_PAGES)

  // PAGE 8 — Summary
  doc.addPage()
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#222222').text('Report summary', MG, MG, { lineBreak: false })
  cy = MG + 26

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333').text('Measurements', MG, cy, { lineBreak: false })
  cy += 14
  const summItems = [
    ['Total roof area', `${Math.round(totalSqFt).toLocaleString()} sqft`],
    ['Total pitched area', `${pitchedArea.toLocaleString()} sqft`],
    ['Total flat area', `${flatArea.toLocaleString()} sqft`],
    ['Total roof facets', `${nFacets} facets`],
    ['Predominant pitch', predPitch],
    ['Total eaves', fmtFtIn(tot.eave.raw)],
    ['Total valleys', fmtFtIn(tot.valley.raw)],
    ['Total hips', fmtFtIn(tot.hip.raw)],
    ['Total ridges', fmtFtIn(tot.ridge.raw)],
    ['Total rakes', fmtFtIn(tot.rake.raw)],
    ['Total wall flashing', fmtFtIn(tot.wall.raw)],
    ['Total step flashing', fmtFtIn(tot.step.raw)],
    ['Hips + ridges', fmtFtIn(tot.hip.raw + tot.ridge.raw)],
    ['Eaves + rakes', fmtFtIn(tot.eave.raw + tot.rake.raw)],
  ]
  const col1s = summItems.slice(0, 7), col2s = summItems.slice(7)
  let sy2 = cy
  for (const [lbl, val] of col1s) { doc.font('Helvetica').fontSize(8).fillColor('#666666').text(lbl, MG, sy2, { lineBreak: false }); doc.font('Helvetica-Bold').fontSize(8).fillColor('#333333').text(val, MG + 110, sy2, { lineBreak: false }); sy2 += 13 }
  sy2 = cy
  for (const [lbl, val] of col2s) { doc.font('Helvetica').fontSize(8).fillColor('#666666').text(lbl, MG + CW / 2, sy2, { lineBreak: false }); doc.font('Helvetica-Bold').fontSize(8).fillColor('#333333').text(val, MG + CW / 2 + 110, sy2, { lineBreak: false }); sy2 += 13 }
  cy = Math.max(cy + col1s.length * 13, cy + col2s.length * 13) + 12

  if (nFacets) {
    const pitchGroups = {}
    for (const f of facets) { const rise = pitchRise(f.pitchDeg || f.slopeDeg); pitchGroups[rise] = (pitchGroups[rise] || 0) + (f.areaSqFt || 0) }
    const pSorted = Object.entries(pitchGroups).sort((a, b) => b[1] - a[1])
    const pitchHeaders = ['Pitch', ...pSorted.map(([p]) => `${p}/12`)]
    const areaRow = ['Area (sqft)', ...pSorted.map(([, a]) => a.toLocaleString())]
    const sqRow = ['Squares', ...pSorted.map(([, a]) => (a / 100).toFixed(1))]
    const pCols = [65, ...pSorted.map(() => Math.floor((CW - 65) / Math.max(pSorted.length, 1)))]
    drawTable(doc, MG, cy, pitchHeaders, [areaRow, sqRow], pCols)
    cy += 16 * 3 + 10
  }

  const wastePcts = [0, 10, 12, 15, 17, 20, 22]
  const swIdx = wastePcts.indexOf(sw)
  const wHeaders = ['', ...wastePcts.map(p => `${p}%`)]
  const wAreaRow = ['Area (sqft)', ...wastePcts.map(p => Math.round(totalSqFt * (1 + p / 100)).toLocaleString())]
  const wSqRow = ['Squares', ...wastePcts.map(p => (totalSqFt * (1 + p / 100) / 100).toFixed(1))]
  const wCols = [65, ...wastePcts.map(() => Math.floor((CW - 65) / wastePcts.length))]
  drawTable(doc, MG, cy, wHeaders, [wAreaRow, wSqRow], wCols)
  if (swIdx >= 0) {
    const swX = MG + 65 + swIdx * wCols[1] + wCols[1] / 2
    doc.font('Helvetica-Bold').fontSize(6).fillColor('#1E3A5F').text('Recommended', swX - 22, cy - 8, { lineBreak: false })
    doc.save().moveTo(swX, cy).lineTo(swX, cy + 16 * 3).strokeColor('#1E3A5F').lineWidth(1.5).dash(3, { space: 2 }).stroke()
    doc.restore()
  }
  cy += 16 * 3 + 12
  doc.font('Helvetica').fontSize(6).fillColor('#999999')
  for (const note of [
    'Recommended waste is based on an asphalt shingle roof with a closed valley system (if applicable).',
    'Several other factors are involved in determining which waste percentage to use, including the',
    'complexity of the roof and individual roof application style. You will also need to calculate the',
    'post-waste quantity of other materials needed (hip and ridge caps, starter shingle, etc.).',
  ]) { doc.text(note, MG, cy, { lineBreak: false }); cy += 8 }
  pageFooter(doc, branding, address, 8, TOTAL_PAGES)

  // PAGE 9 — Materials
  doc.addPage()
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#222222').text('Material calculations', MG, MG, { lineBreak: false })
  cy = MG + 26
  const wastes = [0, 0.10, 0.15, 0.20]
  const mHeaders = ['Product', 'Unit', 'Waste (0%)', 'Waste (10%)', 'Waste (15%)', 'Waste (20%)']
  const mCols = [160, 45, 62, 62, 62, 62]
  const ceil = (v) => Math.ceil(v)
  const sq = totalSqFt / 100
  const matRows = [
    [`Shingle (total sqft)`, '', ...wastes.map(w2 => `${Math.round(totalSqFt * (1 + w2)).toLocaleString()} sqft`)],
    ['  Architectural Shingles', 'bundle', ...wastes.map(w2 => ceil(sq * (1 + w2) * 3))],
    [`Starter (eaves + rakes)`, '', ...wastes.map(w2 => `${Math.round(drv.starterRaw * (1 + w2))} ft`)],
    ['  Starter Strip (120ft)', 'bundle', ...wastes.map(w2 => ceil(drv.starterRaw * (1 + w2) / 120))],
    ['  Starter Roll (33ft)', 'bundle', ...wastes.map(w2 => ceil(drv.starterRaw * (1 + w2) / 33))],
    [`Ice and Water`, '', ...wastes.map(w2 => `${Math.round(drv.leakBarrierRaw * (1 + w2))} ft`)],
    ['  Ice & Water Shield (66ft)', 'roll', ...wastes.map(w2 => ceil(drv.leakBarrierRaw * 3 * (1 + w2) / 200))],
    [`Synthetic (total sqft)`, '', ...wastes.map(w2 => `${Math.round(totalSqFt * (1 + w2)).toLocaleString()} sqft`)],
    ['  Synthetic Underlayment (10sq)', 'roll', ...wastes.map(w2 => ceil(sq * (1 + w2) / 10))],
    [`Capping (hips + ridges)`, '', ...wastes.map(w2 => `${Math.round(drv.ridgeCapRaw * (1 + w2))} ft`)],
    ['  Ridge Cap Shingles (25ft)', 'bundle', ...wastes.map(w2 => ceil(drv.ridgeCapRaw * (1 + w2) / 25))],
    ['  Ridge Cap Shingles (20ft)', 'bundle', ...wastes.map(w2 => ceil(drv.ridgeCapRaw * (1 + w2) / 20))],
    ['Other', '', '', '', '', ''],
    [`  8' Valley (no laps)`, 'sheet', ...wastes.map(w2 => tot.valley.raw > 0 ? ceil(tot.valley.raw * (1 + w2) / 8) : 0)],
    [`  10' Drip Edge (no laps)`, 'sheet', ...wastes.map(w2 => ceil(drv.dripRaw * (1 + w2) / 10))],
    [`  Step Flashing 10ft`, 'piece', ...wastes.map(w2 => drv.stepRaw > 0 ? ceil(drv.stepRaw * (1 + w2) / 10) : 0)],
  ]
  drawTable(doc, MG, cy, mHeaders, matRows, mCols, { fontSize: 7, rowHeight: 14 })
  cy += 14 * (matRows.length + 1) + 10
  doc.font('Helvetica').fontSize(6).fillColor('#999999')
  for (const n of [
    'These calculations are estimates and are not guaranteed. Always double check calculations before ordering materials.',
    'Estimates are based off of the total pitched area (i.e., flat area is excluded).',
  ]) { doc.text(n, MG, cy, { lineBreak: false }); cy += 8 }
  pageFooter(doc, branding, address, 9, TOTAL_PAGES)

  doc.end()
  return done
}

/* ── Handler ─────────────────────────────────────────────────── */

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })

  const { lat, lng, address, branding } = req.body || {}
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' })

  const latF = parseFloat(lat), lngF = parseFloat(lng)
  const bHash = crypto.createHash('md5').update(JSON.stringify(branding || {})).digest('hex').slice(0, 8)
  const cacheKey = `report/v19/${latF.toFixed(6)}/${lngF.toFixed(6)}/${bHash}.pdf`

  try {
    const cached = await r2Get(cacheKey)
    if (cached) return res.status(200).json({ pdf_base64: `data:application/pdf;base64,${cached.toString('base64')}` })
  } catch (e) { console.error('Cache read:', e.message) }

  const apiKey = process.env.GOOGLE_SOLAR_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GOOGLE_SOLAR_API_KEY not configured' })

  let insights = null
  try {
    const r = await fetch(`https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${latF}&location.longitude=${lngF}&requiredQuality=MEDIUM&key=${apiKey}`)
    if (r.ok) insights = await r.json()
  } catch (e) { console.error('Insights:', e.message) }

  let layers = null, requestedPxM = 0.1
  for (const q of ['HIGH', 'MEDIUM']) {
    try {
      const px = q === 'HIGH' ? 0.1 : 0.25
      const r = await fetch(`https://solar.googleapis.com/v1/dataLayers:get?location.latitude=${latF}&location.longitude=${lngF}&radiusMeters=50&view=IMAGERY_AND_ALL_FLUX_LAYERS&requiredQuality=${q}&pixelSizeMeters=${px}&key=${apiKey}`)
      if (r.ok) { layers = await r.json(); requestedPxM = px; break }
    } catch (e) { console.error(`Layers (${q}):`, e.message) }
  }

  if (!layers?.dsmUrl || !layers?.maskUrl) return res.status(502).json({ error: 'Could not retrieve Solar data layers' })

  const [dsmBuf, maskBuf, rgbBuf] = await Promise.all([
    fetch(`${layers.dsmUrl}&key=${apiKey}`).then(r => r.ok ? r.arrayBuffer().then(Buffer.from) : null).catch(() => null),
    fetch(`${layers.maskUrl}&key=${apiKey}`).then(r => r.ok ? r.arrayBuffer().then(Buffer.from) : null).catch(() => null),
    layers.rgbUrl ? fetch(`${layers.rgbUrl}&key=${apiKey}`).then(r => r.ok ? r.arrayBuffer().then(Buffer.from) : null).catch(() => null) : null,
  ])
  if (!dsmBuf || !maskBuf) return res.status(502).json({ error: 'Could not fetch GeoTIFFs' })

  const dsmT = await parseTiff(dsmBuf), maskT = await parseTiff(maskBuf)
  const w = dsmT.w, h = dsmT.h, pxM = requestedPxM

  const rawMask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) rawMask[i] = (maskT.w === w && maskT.h === h ? maskT.data[i] : 0) ? 1 : 0
  const maskData = isolateBuilding(rawMask, w, h)

  let rgbPng
  if (rgbBuf) {
    try {
      const tiffImg = (await (await fromArrayBuffer(rgbBuf.buffer.slice(rgbBuf.byteOffset, rgbBuf.byteOffset + rgbBuf.byteLength))).getImage())
      const bands = await tiffImg.readRasters()
      const rw = tiffImg.getWidth(), rh = tiffImg.getHeight()
      const raw = Buffer.alloc(rw * rh * 3)
      for (let i = 0; i < rw * rh; i++) { raw[i * 3] = bands[0][i]; raw[i * 3 + 1] = bands[1][i]; raw[i * 3 + 2] = bands[2][i] }
      rgbPng = await sharp(raw, { raw: { width: rw, height: rh, channels: 3 } }).resize(w, h, { fit: 'fill' }).png().toBuffer()
    } catch { try { rgbPng = await sharp(rgbBuf).resize(w, h, { fit: 'fill' }).png().toBuffer() } catch {} }
  }
  if (!rgbPng) rgbPng = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 180, g: 180, b: 180 } } }).png().toBuffer()

  const solarSegs = insights?.solarPotential?.roofSegmentStats || []
  const totalSqFt = (insights?.solarPotential?.wholeRoofStats?.areaMeters2 || 0) * SQM_SQFT
  const geoRef = { origin: dsmT.origin, res: dsmT.res }
  const roofData = analyzeRoof(dsmT.data, maskData, w, h, pxM, solarSegs, geoRef)

  const [cleanImg, lengthImg, pitchImg, areaImg, svNorth, svEast, svSouth, svWest] = await Promise.all([
    makeCleanDiagram(roofData),
    makeLengthDiagram(roofData),
    makePitchDiagram(roofData),
    makeAreaDiagram(roofData),
    makeSideView(rgbPng, dsmT.data, maskData, w, h, pxM, 'North'),
    makeSideView(rgbPng, dsmT.data, maskData, w, h, pxM, 'East'),
    makeSideView(rgbPng, dsmT.data, maskData, w, h, pxM, 'South'),
    makeSideView(rgbPng, dsmT.data, maskData, w, h, pxM, 'West'),
  ])
  const sideViews = { North: svNorth, East: svEast, South: svSouth, West: svWest }

  const pdfBuf = await buildPDF({
    branding, address,
    reportDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    totalSqFt, roofData,
    diagrams: { aerial: rgbPng, clean: cleanImg, length: lengthImg, pitch: pitchImg, area: areaImg },
    sideViews,
  })

  r2Put(cacheKey, pdfBuf).catch(e => console.error('Cache write:', e.message))

  const tot = roofData?.totals || {}
  const drv = roofData?.derived || {}
  res.setHeader('Cache-Control', 'public, max-age=3600')
  return res.status(200).json({
    pdf_base64: `data:application/pdf;base64,${pdfBuf.toString('base64')}`,
    measurements: {
      total_area_sqft: Math.round(totalSqFt),
      total_squares: Math.round(totalSqFt / 100),
      facet_count: roofData?.numFacets || 0,
      ridge_ft: tot.ridge?.ft || 0, eave_ft: tot.eave?.ft || 0,
      rake_ft: tot.rake?.ft || 0, hip_ft: tot.hip?.ft || 0, valley_ft: tot.valley?.ft || 0,
      wall_ft: tot.wall?.ft || 0, step_ft: tot.step?.ft || 0,
      drip_ft: drv.drip || 0, ridge_cap_ft: drv.ridgeCap || 0, starter_ft: drv.starter || 0,
    },
  })
}
