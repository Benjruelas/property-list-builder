/**
 * Limit concurrent tippecanoe runs (CPU-heavy) across nationwide workers.
 */
import fs from 'fs'
import path from 'path'
import { DATA_DIR } from './paths.mjs'

const LOCK_ROOT = path.join(DATA_DIR, '.tile-slots')

function maxSlots() {
  return Math.max(1, Number(process.env.PARCEL_TILE_CONCURRENCY || 2))
}

export async function withTileSlot(fn) {
  fs.mkdirSync(LOCK_ROOT, { recursive: true })
  const started = Date.now()
  const timeoutMs = Number(process.env.PARCEL_TILE_LOCK_TIMEOUT_MS || 3 * 60 * 60 * 1000)
  let slotPath = null

  while (!slotPath) {
    for (let i = 0; i < maxSlots(); i++) {
      const p = path.join(LOCK_ROOT, `slot-${i}`)
      try {
        fs.mkdirSync(p)
        fs.writeFileSync(path.join(p, 'holder'), String(process.pid))
        slotPath = p
        break
      } catch (e) {
        if (e.code !== 'EEXIST') throw e
      }
    }
    if (slotPath) break
    if (Date.now() - started > timeoutMs) throw new Error('tile slot lock timeout')
    await new Promise((r) => setTimeout(r, 500 + Math.floor(Math.random() * 500)))
  }

  try {
    return await fn()
  } finally {
    try {
      fs.rmSync(slotPath, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}
