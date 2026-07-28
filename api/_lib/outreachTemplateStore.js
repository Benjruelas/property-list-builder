/**
 * KV storage for email/SMS outreach templates.
 */

import { readLocalDevArray, writeLocalDevArray } from './localDevPersistence.js'
import { kv, kvAvailable } from './kvBootstrap.js'

export const OUTREACH_TEMPLATES_KV_KEY = 'outreach_templates'

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

export async function getAllOutreachTemplates() {
  const result = await loadArray(OUTREACH_TEMPLATES_KV_KEY, fallbackTemplates)
  fallbackTemplates = result
  return result
}

export async function saveAllOutreachTemplates(templates) {
  fallbackTemplates = templates
  await writeLocalDevArray(OUTREACH_TEMPLATES_KV_KEY, templates)
  if (!kvAvailable || !kv) return
  try {
    await kv.set(OUTREACH_TEMPLATES_KV_KEY, templates).catch(() =>
      kv.set(OUTREACH_TEMPLATES_KV_KEY, JSON.stringify(templates)),
    )
  } catch (e) {
    console.warn('KV save failed (outreach_templates)', e.message)
  }
}
