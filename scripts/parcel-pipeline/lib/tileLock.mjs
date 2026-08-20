/**
 * Limit concurrent tippecanoe runs (CPU-heavy) across nationwide workers.
 * Reclaims slots whose holder PID is dead so a crashed tiler cannot jam the queue.
 */
import fs from 'fs'
import path from 'path'
import { DATA_DIR } from './paths.mjs'

const LOCK_ROOT = path.join(DATA_DIR, '.tile-slots')

function maxSlots() {
  return Math.max(1, Number(process.env.PARCEL_TILE_CONCURRENCY || 2))
}

function pidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function reclaimDeadSlot(slotPath) {
  const holderPath = path.join(slotPath, 'holder')
  if (!fs.existsSync(holderPath)) {
    try {
      fs.rmSync(slotPath, { recursive: true, force: true })
      return true
    } catch {
      return false
    }
  }
  const raw = fs.readFileSync(holderPath, 'utf8').trim()
  const pid = Number(raw)
  if (pidAlive(pid)) return false
  console.warn(`[tile-lock] reclaiming dead slot ${path.basename(slotPath)} (pid ${raw || 'unknown'})`)
  try {
    fs.rmSync(slotPath, { recursive: true, force: true })
    return true
  } catch (e) {
    console.warn(`[tile-lock] reclaim failed: ${e.message}`)
    return false
  }
}

/** Clear every tile slot whose holder is not alive. Safe to call at supervisor start. */
export function clearDeadTileSlots() {
  if (!fs.existsSync(LOCK_ROOT)) return 0
  let n = 0
  for (const ent of fs.readdirSync(LOCK_ROOT, { withFileTypes: true })) {
    if (!ent.isDirectory() || !ent.name.startsWith('slot-')) continue
    if (reclaimDeadSlot(path.join(LOCK_ROOT, ent.name))) n++
  }
  return n
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
        // Slot dir exists — free it if the holder is gone, then retry this slot.
        reclaimDeadSlot(p)
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
