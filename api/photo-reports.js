import { resolveDevBypassUser } from './lib/devBypassUsers.js'
import {
  getAllPhotoReports,
  saveAllPhotoReports,
  getPhotoReportById,
  updatePhotoReportAtIndex,
  getAllReportTemplates,
} from './lib/reportStore.js'
import { getLeadWithAccess, getVisibleLeads } from './lib/leadAccess.js'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

async function verifyFirebaseToken(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
  if (!apiKey || !idToken) return null
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    )
    if (!r.ok) return null
    const data = await r.json()
    const user = data.users && data.users[0]
    if (!user) return null
    return { uid: user.localId, email: (user.email || '').toLowerCase() }
  } catch (e) {
    console.error('Token verify error', e.message)
    return null
  }
}

function buildReportFromBody(body, user, existing = null) {
  const now = new Date().toISOString()
  const leadId = String(body.leadId ?? existing?.leadId ?? '').trim()
  if (!leadId && !existing) throw new Error('leadId is required')

  let sections = body.sections ?? existing?.sections ?? []
  if (!Array.isArray(sections)) sections = []
  sections = sections.map((s, i) => ({
    id: s.id || `sec_${Date.now()}_${i}`,
    subtitle: String(s.subtitle || '').slice(0, 200),
    description: String(s.description || '').slice(0, 4000),
    photoIds: Array.isArray(s.photoIds) ? s.photoIds : [],
    order: typeof s.order === 'number' ? s.order : i,
  })).sort((a, b) => a.order - b.order)

  return {
    id: existing?.id || `preport_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    leadId: leadId || existing.leadId,
    title: String(body.title ?? existing?.title ?? 'Photo Report').trim().slice(0, 200),
    sections,
    templateId: body.templateId ?? existing?.templateId ?? null,
    status: existing?.status || 'draft',
    pdfKey: body.pdfKey !== undefined ? body.pdfKey : (existing?.pdfKey ?? null),
    publicToken: existing?.publicToken ?? null,
    ownerId: existing?.ownerId || user.uid,
    ownerEmail: existing?.ownerEmail || user.email,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    sentAt: existing?.sentAt ?? null,
  }
}

let _s3
function s3() {
  if (_s3) return _s3
  _s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
  return _s3
}

async function canAccessReport(user, report) {
  if (report.ownerId === user.uid) return true
  const { lead } = await getLeadWithAccess(user, report.leadId)
  return !!lead
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  const idToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const host = req.headers.host || req.headers['x-forwarded-host'] || ''
  const origin = req.headers.origin || ''
  const isLocalhost = /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(host) || /localhost|127\.0\.0\.1|\[::1\]/.test(origin)
  const allowDevBypass = isLocalhost || process.env.ENABLE_DEV_BYPASS === 'true'
  let user = allowDevBypass ? resolveDevBypassUser(idToken) : null
  if (!user) user = await verifyFirebaseToken(idToken)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  try {
    if (req.method === 'GET') {
      const { reportId, leadId, pdfKey } = req.query || {}

      if (pdfKey) {
        const key = String(pdfKey)
        if (!key.startsWith('report-pdfs/')) return res.status(400).json({ error: 'Malformed key' })
        const all = await getAllPhotoReports()
        const report = all.find((r) => r.pdfKey === key)
        if (!report || !(await canAccessReport(user, report))) {
          return res.status(403).json({ error: 'Forbidden' })
        }
        const r = await s3().send(new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
        }))
        const chunks = []
        for await (const c of r.Body) chunks.push(c)
        const body = Buffer.concat(chunks)
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Cache-Control', 'private, max-age=300')
        return res.status(200).send(body)
      }

      const visibleLeads = await getVisibleLeads(user)
      const visibleLeadIds = new Set(visibleLeads.map((l) => l.id))
      const all = await getAllPhotoReports()
      let reports = all.filter(
        (r) => r.ownerId === user.uid || visibleLeadIds.has(r.leadId)
      )

      if (reportId) {
        const r = reports.find((x) => x.id === reportId)
        if (!r) return res.status(404).json({ error: 'Report not found' })
        return res.status(200).json({ report: r })
      }

      if (leadId) {
        reports = reports.filter((r) => r.leadId === leadId)
      }

      reports.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      return res.status(200).json({ reports })
    }

    const body = req.body || {}

    if (req.method === 'POST') {
      const { lead } = await getLeadWithAccess(user, body.leadId)
      if (!lead) return res.status(404).json({ error: 'Lead not found' })

      let seed = body
      const templateId = body.templateId || body.fromTemplate
      if (templateId) {
        const templates = await getAllReportTemplates()
        const tpl = templates.find((t) => t.id === templateId)
        if (tpl && tpl.ownerId === user.uid) {
          const freshSections = (tpl.sections || []).map((s, i) => ({
            ...s,
            id: `sec_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
            photoIds: [],
            order: i,
          }))
          seed = {
            ...body,
            title: body.title || tpl.title || tpl.name,
            sections: body.sections || freshSections,
            templateId: tpl.id,
          }
        }
      }

      let report
      try {
        report = buildReportFromBody(seed, user)
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }

      const all = await getAllPhotoReports()
      all.push(report)
      await saveAllPhotoReports(all)
      return res.status(201).json({ report })
    }

    if (req.method === 'PATCH') {
      const { reportId } = body
      if (!reportId) return res.status(400).json({ error: 'reportId is required' })

      const { report, index, all } = await getPhotoReportById(reportId)
      if (!report || !(await canAccessReport(user, report))) {
        return res.status(404).json({ error: 'Report not found' })
      }
      if (report.ownerId !== user.uid) {
        return res.status(403).json({ error: 'Only the report owner can edit' })
      }

      let updated
      try {
        updated = buildReportFromBody(body, user, report)
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }

      await updatePhotoReportAtIndex(all, index, updated)
      return res.status(200).json({ report: updated })
    }

    if (req.method === 'DELETE') {
      const { reportId } = body
      if (!reportId) return res.status(400).json({ error: 'reportId is required' })

      const { report, index, all } = await getPhotoReportById(reportId)
      if (!report || report.ownerId !== user.uid) {
        return res.status(404).json({ error: 'Report not found' })
      }

      const next = all.filter((_, i) => i !== index)
      await saveAllPhotoReports(next)
      return res.status(200).json({ message: 'Deleted' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('photo-reports error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
