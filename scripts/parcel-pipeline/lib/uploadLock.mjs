/**
 * Limit how many counties upload to R2 at once so each can use higher
 * per-county concurrency without starving / stalling the connection pool.
 */
import fs from 'fs'
import path from 'path'
import { DATA_DIR } from './paths.mjs'

const LOCK_ROOT = path.join(DATA_DIR, '.upload-slots')

function maxSlots() {
  return Math.max(1, Number(process.env.PARCEL_UPLOAD_COUNTY_CONCURRENCY || 3))
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
  console.warn(`[upload-lock] reclaiming dead slot ${path.basename(slotPath)} (pid ${raw || 'unknown'})`)
  try {
    fs.rmSync(slotPath, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

export function clearDeadUploadSlots() {
  if (!fs.existsSync(LOCK_ROOT)) return 0
  let n = 0
  for (const ent of fs.readdirSync(LOCK_ROOT, { withFileTypes: true })) {
    if (!ent.isDirectory() || !ent.name.startsWith('slot-')) continue
    if (reclaimDeadSlot(path.join(LOCK_ROOT, ent.name))) n++
  }
  return n
}

export async function withUploadSlot(fn) {
  fs.mkdirSync(LOCK_ROOT, { recursive: true })
  const started = Date.now()
  const timeoutMs = Number(process.env.PARCEL_UPLOAD_LOCK_TIMEOUT_MS || 3 * 60 * 60 * 1000)
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
        reclaimDeadSlot(p)
      }
    }
    if (slotPath) break
    if (Date.now() - started > timeoutMs) throw new Error('upload slot lock timeout')
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
