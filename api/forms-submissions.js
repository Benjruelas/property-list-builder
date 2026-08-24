import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { requireAuth } from './_lib/apiAuth.js'
import { getAllTeams } from './_lib/teams.js'
import { getAllFormTemplates } from './_lib/formTemplateStore.js'
import { getAllSubmissions, saveAllSubmissions, getAllInvites, saveAllInvites } from './_lib/formInvites.js'
import { buildAccessContext, getResourceAccess, canView, canEdit } from './_lib/resourceContext.js'
import { isWellFormedFormSubmissionPdfKey } from './_lib/formPdfKey.js'

/**
 * Auth'd form submissions list + completed PDF download/delete.
 *
 * GET ?templateId=     → submissions for a template the user can view
 * GET ?submissionId=   → single submission metadata
 * GET ?pdfKey=         → stream completed PDF (access via parent template)
 * DELETE ?submissionId= or ?pdfKey= → remove submission + PDF (requires edit on template)
 */

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

function summarizeSubmission(sub) {
  return {
    id: sub.id,
    templateId: sub.templateId,
    submittedAt: sub.submittedAt,
    recipientEmail: sub.recipientEmail || null,
    recipientPhone: sub.recipientPhone || null,
    submitterEmail: sub.submitterEmail || null,
    leadId: sub.leadId || null,
    leadName: sub.leadName || null,
    source: sub.source || null,
    hasPdf: !!sub.pdfKey,
    pdfKey: sub.pdfKey || null,
  }
}

async function deleteR2Key(key) {
  if (!key || !process.env.R2_BUCKET_NAME) return
  try {
    await s3().send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }))
  } catch (e) {
    console.warn('R2 submission delete failed', e.message)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await requireAuth(req, res)
  if (!user) return

  try {
    const [templates, allTeams, submissions] = await Promise.all([
      getAllFormTemplates(),
      getAllTeams(),
      getAllSubmissions(),
    ])
    const ctx = buildAccessContext(allTeams, user)
    const templateById = new Map(templates.map((t) => [t.id, t]))

    if (req.method === 'DELETE') {
      const submissionId = String(req.query.submissionId || '').trim()
      const pdfKey = String(req.query.pdfKey || '').trim()
      // Prefer exact submission id; fall back to pdfKey (lead list rows often use invite id as `id`).
      const sub = (submissionId
        ? submissions.find((s) => s.id === submissionId)
        : null)
        || (pdfKey
          ? submissions.find((s) => s.pdfKey === pdfKey)
          : null)
      if (!sub) return res.status(404).json({ error: 'Submission not found' })
      const template = templateById.get(sub.templateId)
      if (!template || !canEdit(getResourceAccess(template, user, ctx))) {
        return res.status(403).json({ error: 'You do not have permission to delete this submission' })
      }
      if (sub.pdfKey) await deleteR2Key(sub.pdfKey)
      await saveAllSubmissions(submissions.filter((s) => s.id !== sub.id))
      // Remove the linked invite so Lead Details doesn't keep a "Completed" ghost row.
      if (sub.inviteId) {
        const invites = await getAllInvites()
        await saveAllInvites(invites.filter((inv) => inv.id !== sub.inviteId))
      }
      return res.status(200).json({ ok: true, id: sub.id })
    }

    const visibleTemplateIds = new Set(
      templates.filter((t) => canView(getResourceAccess(t, user, ctx))).map((t) => t.id),
    )

    const pdfKey = String(req.query.pdfKey || '').trim()
    if (pdfKey) {
      if (!isWellFormedFormSubmissionPdfKey(pdfKey)) {
        return res.status(400).json({ error: 'Invalid pdfKey' })
      }
      const sub = submissions.find((s) => s.pdfKey === pdfKey)
      if (!sub || !visibleTemplateIds.has(sub.templateId)) {
        return res.status(403).json({ error: 'You do not have access to this submission' })
      }
      try {
        const r = await s3().send(new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: pdfKey,
        }))
        const chunks = []
        for await (const c of r.Body) chunks.push(c)
        const body = Buffer.concat(chunks)
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Cache-Control', 'private, no-store')
        const name = (templateById.get(sub.templateId)?.name || 'form').replace(/[^\w\-]+/g, '_')
        res.setHeader('Content-Disposition', `inline; filename="${name}-completed.pdf"`)
        return res.status(200).send(body)
      } catch (e) {
        if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
          return res.status(404).json({ error: 'PDF not found' })
        }
        throw e
      }
    }

    const submissionId = String(req.query.submissionId || '').trim()
    if (submissionId) {
      const sub = submissions.find((s) => s.id === submissionId)
      if (!sub || !visibleTemplateIds.has(sub.templateId)) {
        return res.status(404).json({ error: 'Submission not found' })
      }
      return res.status(200).json({
        submission: {
          ...summarizeSubmission(sub),
          templateName: templateById.get(sub.templateId)?.name || 'Form',
        },
      })
    }

    const templateId = String(req.query.templateId || '').trim()
    if (!templateId) {
      return res.status(400).json({ error: 'templateId, submissionId, or pdfKey is required' })
    }
    if (!visibleTemplateIds.has(templateId)) {
      return res.status(403).json({ error: 'You do not have access to this template' })
    }

    const items = submissions
      .filter((s) => s.templateId === templateId)
      .map(summarizeSubmission)
      .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))

    return res.status(200).json({
      submissions: items,
      templateName: templateById.get(templateId)?.name || 'Form',
    })
  } catch (err) {
    console.error('forms-submissions error', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
