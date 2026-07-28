/**
 * KV storage for deal create templates.
 */

import { readLocalDevArray, writeLocalDevArray } from './localDevPersistence.js'
import { kv, kvAvailable } from './kvBootstrap.js'

export const DEAL_TEMPLATES_KV_KEY = 'deal_templates'

let fallbackTemplates = []

async function loadArray(key, fallback) {
  if (!kvAvailable || !kv) {
    return readLocalDevArray(key, fallback)
  }
  try {
    const data = await kv.get(key)
    const parsed = typeof data === 'string' ? (data ? JSON.parse(data) : null) : data
    const result = Array.isArray(parsed) ? parsed : []
    if (result.length > 0) return result
    return readLocalDevArray(key, fallback)
  } catch {
    return readLocalDevArray(key, fallback)
  }
}

export async function getAllDealTemplates() {
  const result = await loadArray(DEAL_TEMPLATES_KV_KEY, fallbackTemplates)
  fallbackTemplates = result
  return result
}

export async function saveAllDealTemplates(templates) {
  fallbackTemplates = templates
  await writeLocalDevArray(DEAL_TEMPLATES_KV_KEY, templates)
  if (!kvAvailable || !kv) return
  try {
    await kv.set(DEAL_TEMPLATES_KV_KEY, templates).catch(() =>
      kv.set(DEAL_TEMPLATES_KV_KEY, JSON.stringify(templates)),
    )
  } catch (e) {
    console.warn('KV save failed (deal_templates)', e.message)
  }
}
