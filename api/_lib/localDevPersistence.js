/**
 * Disk-backed arrays for local dev when KV/Redis is not configured.
 * Ensures data written by one serverless route is visible to others (e.g. preview tokens).
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const DIR = path.join(process.cwd(), '.local-dev-data')

export function useLocalDevFiles() {
  return !process.env.KV_REST_API_URL && !process.env.REDIS_URL
}

/** Mirror writes locally in dev even when KV is configured (helps vercel dev route isolation). */
export function shouldMirrorToLocalFiles() {
  return process.env.NODE_ENV !== 'production'
}

function filePath(key) {
  return path.join(DIR, `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
}

export async function readLocalDevArray(key, memoryFallback = []) {
  if (!useLocalDevFiles() && !shouldMirrorToLocalFiles()) return memoryFallback
  try {
    const raw = await fs.readFile(filePath(key), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : memoryFallback
  } catch {
    return memoryFallback
  }
}

export async function writeLocalDevArray(key, data) {
  if (!useLocalDevFiles() && !shouldMirrorToLocalFiles()) return
  try {
    await fs.mkdir(DIR, { recursive: true })
    await fs.writeFile(filePath(key), JSON.stringify(data))
  } catch (e) {
    console.warn('[localDevPersistence] write failed', key, e.message)
  }
}
