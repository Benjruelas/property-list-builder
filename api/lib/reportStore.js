/**
 * KV storage for lead photo reports.
 */

import { readLocalDevArray, writeLocalDevArray } from './localDevPersistence.js'

export const REPORTS_KV_KEY = 'user_photo_reports'
export const REPORT_TEMPLATES_KV_KEY = 'report_templates'

let kv = null
let kvAvailable = false

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({ url: process.env.REDIS_URL })
    await kv.connect()
    kvAvailable = true
  } catch {
    kvAvailable = false
  }
}

let fallbackReports = []
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

export async function getAllPhotoReports() {
  const result = await loadArray(REPORTS_KV_KEY, fallbackReports)
  fallbackReports = result
  return result
}

export async function saveAllPhotoReports(reports) {
  fallbackReports = reports
  await writeLocalDevArray(REPORTS_KV_KEY, reports)
  if (!kvAvailable || !kv) return
  try {
    await kv.set(REPORTS_KV_KEY, reports).catch(() => kv.set(REPORTS_KV_KEY, JSON.stringify(reports)))
  } catch (e) {
    console.warn('KV save failed (user_photo_reports)', e.message)
  }
}

export async function getPhotoReportById(reportId) {
  const all = await getAllPhotoReports()
  const index = all.findIndex((r) => r.id === reportId)
  if (index === -1) return { report: null, index: -1, all }
  return { report: all[index], index, all }
}

export async function updatePhotoReportAtIndex(all, index, report) {
  const next = [...all]
  next[index] = report
  await saveAllPhotoReports(next)
  return report
}

export async function getAllReportTemplates() {
  const result = await loadArray(REPORT_TEMPLATES_KV_KEY, fallbackTemplates)
  fallbackTemplates = result
  return result
}

export async function saveAllReportTemplates(templates) {
  fallbackTemplates = templates
  if (!kvAvailable || !kv) return
  try {
    await kv.set(REPORT_TEMPLATES_KV_KEY, templates).catch(() =>
      kv.set(REPORT_TEMPLATES_KV_KEY, JSON.stringify(templates))
    )
  } catch (e) {
    console.warn('KV save failed (report_templates)', e.message)
  }
}
