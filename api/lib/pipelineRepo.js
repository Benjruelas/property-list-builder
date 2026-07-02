/**
 * Per-owner pipeline shards with dual-write / shadow-read / cutover modes.
 */

import { flags } from './flags.js'
import { kv, kvAvailable } from './kvBootstrap.js'
import { kvSAdd, kvSMembers, kvMSet } from './kvOps.js'
import { withTiming } from './timing.js'
import { filterVisibleResources } from './resourceContext.js'
import { collectAffectedUidsForResource } from './shareIndex.js'
import { getAllTeams } from './teams.js'

export const PIPELINE_INDEX_PREFIX = 'pipeline-index:'
export const PIPELINES_SHARD_PREFIX = 'pipelines:'
export const SHARED_PIPELINES_PREFIX = 'shared-pipelines:'

async function getMonolithPipelines() {
  const { getAllPipelines } = await import('./pipelineStoreFull.js')
  return getAllPipelines()
}

function ownerShardKey(ownerId) {
  return `${PIPELINES_SHARD_PREFIX}${ownerId}`
}

function sharedIndexKey(uid) {
  return `${SHARED_PIPELINES_PREFIX}${uid}`
}

function pipelineIndexKey(pipelineId) {
  return `${PIPELINE_INDEX_PREFIX}${pipelineId}`
}

async function kvGetJson(key) {
  if (!kvAvailable || !kv) return null
  try {
    const data = await kv.get(key)
    if (!data) return null
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch {
    return null
  }
}

async function kvSetJson(key, value) {
  if (!kvAvailable || !kv) return
  try {
    await kv.set(key, value).catch(() => kv.set(key, JSON.stringify(value)))
  } catch (e) {
    console.warn('pipelineRepo KV set failed', key, e.message)
  }
}

export async function getOwnerPipelines(ownerId) {
  if (!ownerId) return []
  const data = await kvGetJson(ownerShardKey(ownerId))
  return Array.isArray(data) ? data : []
}

export async function saveOwnerPipelines(ownerId, pipelines) {
  if (!ownerId) return
  await kvSetJson(ownerShardKey(ownerId), Array.isArray(pipelines) ? pipelines : [])
}

export async function getSharedPipelineOwnerIds(uid) {
  if (!uid) return []
  return kvSMembers(sharedIndexKey(uid))
}

export async function indexPipeline(pipeline) {
  if (!pipeline?.id || !pipeline?.ownerId || !kvAvailable) return
  await kv.set(pipelineIndexKey(pipeline.id), pipeline.ownerId)
}

export async function removePipelineIndex(pipelineId) {
  if (!pipelineId || !kvAvailable) return
  try {
    await kv.del(pipelineIndexKey(pipelineId))
  } catch { /* ignore */ }
}

export async function getPipelineOwnerId(pipelineId) {
  if (!pipelineId || !kvAvailable) return null
  try {
    return await kv.get(pipelineIndexKey(pipelineId))
  } catch {
    return null
  }
}

export async function writePipelinesToShards(allPipelines) {
  const mode = flags.PIPELINES_SHARDED()
  if (mode === 'off' || !kvAvailable) return
  const byOwner = new Map()
  const indexEntries = {}
  for (const pipeline of allPipelines || []) {
    const ownerId = pipeline?.ownerId
    if (!ownerId) continue
    if (!byOwner.has(ownerId)) byOwner.set(ownerId, [])
    byOwner.get(ownerId).push(pipeline)
    if (pipeline.id) indexEntries[pipelineIndexKey(pipeline.id)] = ownerId
  }
  // Batch the pipeline->owner index writes into one round trip instead of N.
  await Promise.all([
    kvMSet(indexEntries),
    ...[...byOwner.entries()].map(([ownerId, pipes]) => saveOwnerPipelines(ownerId, pipes)),
  ])
}

export async function getVisiblePipelinesFromShards(user, ctx) {
  const ownerIds = new Set([user.uid])
  const shared = await getSharedPipelineOwnerIds(user.uid)
  for (const id of shared) ownerIds.add(id)
  const chunks = await Promise.all([...ownerIds].map((oid) => getOwnerPipelines(oid)))
  return filterVisibleResources(chunks.flat(), user, ctx)
}

function diffPipelineSets(a, b) {
  const aIds = new Set((a || []).map((p) => p.id))
  const bIds = new Set((b || []).map((p) => p.id))
  return {
    onlyA: [...aIds].filter((id) => !bIds.has(id)),
    onlyB: [...bIds].filter((id) => !aIds.has(id)),
    countA: aIds.size,
    countB: bIds.size,
  }
}

export async function getPipelinesForUser(user, ctx) {
  const mode = flags.PIPELINES_SHARDED()
  const monolith = filterVisibleResources(await getMonolithPipelines(), user, ctx)
  if (mode === 'off') return monolith

  const sharded = await withTiming('pipelineRepo.getVisiblePipelinesFromShards', () =>
    getVisiblePipelinesFromShards(user, ctx), { uid: user.uid })

  if (mode === 'shadow') {
    const diff = diffPipelineSets(monolith, sharded)
    if (diff.onlyA.length || diff.onlyB.length || diff.countA !== diff.countB) {
      console.warn(JSON.stringify({ type: 'pipeline_shard_parity_diff', ...diff, uid: user.uid }))
    }
    return monolith
  }
  return sharded
}

export async function backfillPipelineShards() {
  const all = await getMonolithPipelines()
  const allTeams = await getAllTeams()
  const byOwner = new Map()
  const sharedPairs = []
  const indexEntries = {}

  for (const pipeline of all) {
    const ownerId = pipeline?.ownerId
    if (!ownerId) continue
    if (!byOwner.has(ownerId)) byOwner.set(ownerId, [])
    byOwner.get(ownerId).push(pipeline)
    if (pipeline.id) indexEntries[pipelineIndexKey(pipeline.id)] = ownerId
    for (const uid of collectAffectedUidsForResource(pipeline, allTeams)) {
      if (uid !== ownerId) sharedPairs.push([uid, ownerId])
    }
  }

  await kvMSet(indexEntries)
  await Promise.all([...byOwner.entries()].map(([ownerId, pipes]) => saveOwnerPipelines(ownerId, pipes)))
  const byUid = new Map()
  for (const [uid, ownerId] of sharedPairs) {
    if (!byUid.has(uid)) byUid.set(uid, new Set())
    byUid.get(uid).add(ownerId)
  }
  await Promise.all([...byUid.entries()].map(([uid, owners]) => kvSAdd(sharedIndexKey(uid), ...owners)))

  return { owners: byOwner.size, pipelines: all.length, sharedLinks: sharedPairs.length }
}

export default {
  getPipelinesForUser,
  writePipelinesToShards,
  backfillPipelineShards,
}
