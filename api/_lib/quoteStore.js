/**
 * KV storage for quote templates and quote instances.
 */

import { readLocalDevArray, writeLocalDevArray } from './localDevPersistence.js'
import { kv, kvAvailable } from './kvBootstrap.js'

export const TEMPLATES_KV_KEY = 'quote_templates'
export const QUOTES_KV_KEY = 'user_quotes'

let fallbackTemplates = []
let fallbackQuotes = []

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

export async function getAllQuoteTemplates() {
  const result = await loadArray(TEMPLATES_KV_KEY, fallbackTemplates)
  fallbackTemplates = result
  return result
}

export async function saveAllQuoteTemplates(templates) {
  fallbackTemplates = templates
  await writeLocalDevArray(TEMPLATES_KV_KEY, templates)
  if (!kvAvailable || !kv) return
  try {
    await kv.set(TEMPLATES_KV_KEY, templates).catch(() => kv.set(TEMPLATES_KV_KEY, JSON.stringify(templates)))
  } catch (e) {
    console.warn('KV save failed (quote_templates)', e.message)
  }
}

export async function getAllQuotes() {
  const result = await loadArray(QUOTES_KV_KEY, fallbackQuotes)
  fallbackQuotes = result
  return result
}

export async function saveAllQuotes(quotes) {
  fallbackQuotes = quotes
  await writeLocalDevArray(QUOTES_KV_KEY, quotes)
  if (!kvAvailable || !kv) return
  try {
    await kv.set(QUOTES_KV_KEY, quotes).catch(() => kv.set(QUOTES_KV_KEY, JSON.stringify(quotes)))
  } catch (e) {
    console.warn('KV save failed (user_quotes)', e.message)
  }
}

export async function getQuoteById(quoteId) {
  const all = await getAllQuotes()
  const idx = all.findIndex((q) => q.id === quoteId)
  if (idx === -1) return { quote: null, index: -1, all }
  return { quote: all[idx], index: idx, all }
}

export async function updateQuoteAtIndex(all, index, quote) {
  all[index] = quote
  await saveAllQuotes(all)
  return quote
}
