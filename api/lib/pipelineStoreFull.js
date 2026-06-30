/**
 * Shared KV storage for user_pipelines with optional locking and version bumps.
 */

import { kv, kvAvailable } from './kvBootstrap.js'
import { flags } from './flags.js'
import { withKvLock } from './kvLock.js'
import { withTiming } from './timing.js'
import { normalizePipelineStore } from './pipelineStore.js'
import { writePipelinesToShards } from './pipelineRepo.js'
import { bumpPipelinesVersionsForResource } from './dataVersion.js'

export const PIPELINES_KV_KEY = 'user_pipelines'
const LOCK_KEY = 'lock:user_pipelines'

let fallbackStore = []
let pipelinesReadCache = null
let pipelinesReadCacheAt = 0
const PIPELINES_READ_CACHE_MS = 3000

function invalidatePipelinesReadCache() {
  pipelinesReadCache = null
  pipelinesReadCacheAt = 0
}

export { dedupePipelinesById, normalizePipelineStore } from './pipelineStore.js'

export async function getAllPipelines() {
  if (pipelinesReadCache && Date.now() - pipelinesReadCacheAt < PIPELINES_READ_CACHE_MS) {
    return pipelinesReadCache
  }
  return withTiming('pipelineStore.getAllPipelines', async () => {
    if (!kvAvailable || !kv) return normalizePipelineStore(fallbackStore)
    try {
      const data = await kv.get(PIPELINES_KV_KEY)
      const pipelines = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
      const raw = Array.isArray(pipelines) ? pipelines : []
      const result = normalizePipelineStore(raw)
      if (result.length !== raw.length) {
        fallbackStore = result
        try {
          await kv.set(PIPELINES_KV_KEY, result).catch(() => kv.set(PIPELINES_KV_KEY, JSON.stringify(result)))
        } catch (e) {
          console.warn('Pipeline dedupe save failed', e.message)
        }
      } else {
        fallbackStore = result
      }
      pipelinesReadCache = result
      pipelinesReadCacheAt = Date.now()
      return result
    } catch {
      const result = normalizePipelineStore(fallbackStore)
      pipelinesReadCache = result
      pipelinesReadCacheAt = Date.now()
      return result
    }
  })
}

export async function saveAllPipelines(pipelines, { changedResources = [] } = {}) {
  return withTiming('pipelineStore.saveAllPipelines', async () => {
    invalidatePipelinesReadCache()
    const normalized = normalizePipelineStore(Array.isArray(pipelines) ? pipelines : [])
    fallbackStore = normalized
    if (kvAvailable && kv) {
      try {
        await kv.set(PIPELINES_KV_KEY, normalized).catch(() => kv.set(PIPELINES_KV_KEY, JSON.stringify(normalized)))
      } catch (e) {
        console.warn('KV save failed (user_pipelines)', e.message)
      }
    }
    await writePipelinesToShards(normalized)
    if (flags.VERSIONED_POLL()) {
      for (const item of changedResources) {
        await bumpPipelinesVersionsForResource(item.resource, { prevResource: item.prevResource })
      }
    }
    return normalized
  }, { count: Array.isArray(pipelines) ? pipelines.length : 0 })
}

export async function mutatePipelines(mutatorFn, { changedResources = [] } = {}) {
  const run = async () => {
    const all = await getAllPipelines()
    const next = await mutatorFn(all)
    if (next === undefined || next === all) return all
    return saveAllPipelines(next, { changedResources })
  }
  if (!flags.PIPELINES_LOCK()) return run()
  const locked = await withKvLock(LOCK_KEY, run)
  if (locked !== null) return locked
  return run()
}

export default {
  getAllPipelines,
  saveAllPipelines,
  mutatePipelines,
}
