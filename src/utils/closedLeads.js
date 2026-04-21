/**
 * Closed leads archive.
 *
 * When a lead is closed from the pipeline, a full immutable snapshot is stored
 * here so the user keeps a searchable database of past leads with their notes,
 * tasks, contact info, and full stage-time history.
 *
 * Record shape:
 * {
 *   id,                 // original lead.id
 *   parcelId,
 *   closedAt,           // ms timestamp
 *   closedFrom: { pipelineId, title, isLocal, columns: [{id, name}] },
 *   lead,               // original lead object at close time
 *   stageTime,          // { [columnId]: totalMs } - finalized cumulative time per stage
 *   notes,              // string snapshot of parcel_notes[parcelId]
 *   tasks,              // [] snapshot of lead_tasks matching this lead
 *   contacts,           // skip_traced_parcels[parcelId] snapshot
 * }
 */

const STORAGE_KEY = 'closed_leads'

export const loadClosedLeads = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const saveClosedLeads = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []))
  } catch (e) {
    console.error('Error saving closed leads:', e)
  }
}

export const addClosedLead = (record) => {
  if (!record || !record.id) return
  const list = loadClosedLeads()
  if (list.some((r) => r.id === record.id)) {
    saveClosedLeads(list.map((r) => (r.id === record.id ? record : r)))
    return
  }
  saveClosedLeads([...list, record])
}

export const removeClosedLead = (id) => {
  if (!id) return
  const list = loadClosedLeads()
  saveClosedLeads(list.filter((r) => r.id !== id))
}

/** Immutably update a single closed-lead record by id. */
export const updateClosedLead = (id, updater) => {
  if (!id || typeof updater !== 'function') return null
  const list = loadClosedLeads()
  const idx = list.findIndex((r) => r.id === id)
  if (idx < 0) return null
  const next = { ...list[idx], ...updater(list[idx]) }
  const updated = [...list]
  updated[idx] = next
  saveClosedLeads(updated)
  return next
}

export const getClosedLeadById = (id) => {
  if (!id) return null
  return loadClosedLeads().find((r) => r.id === id) || null
}

// --- Notes ---
export const getClosedLeadNote = (record) => (record?.notes || '')
export const saveClosedLeadNote = (id, value) =>
  updateClosedLead(id, () => ({ notes: String(value ?? '') }))

// --- Tasks ---
const sortTasks = (arr) =>
  [...arr].sort((a, b) => {
    const aSched = a.scheduledAt ?? 0
    const bSched = b.scheduledAt ?? 0
    if (aSched && bSched) return aSched - bSched
    if (aSched) return -1
    if (bSched) return 1
    return (b.createdAt || 0) - (a.createdAt || 0)
  })

export const getClosedLeadTasks = (record) => {
  const tasks = Array.isArray(record?.tasks) ? record.tasks : []
  return sortTasks(tasks)
}

export const addClosedLeadTask = (id, { title = '', scheduledAt = null, scheduledEndAt = null } = {}) => {
  const now = Date.now()
  const task = {
    id: `task-${now}-${Math.random().toString(36).slice(2, 9)}`,
    title: (title ?? '').toString().trim(),
    completed: false,
    createdAt: now,
    completedAt: null,
    scheduledAt: scheduledAt && Number.isFinite(scheduledAt) ? scheduledAt : null,
    scheduledEndAt: scheduledEndAt && Number.isFinite(scheduledEndAt) ? scheduledEndAt : null,
    pipelineId: null,
    parcelId: null
  }
  updateClosedLead(id, (r) => ({ tasks: [...(r.tasks || []), task] }))
  return task
}

export const toggleClosedLeadTask = (id, taskId) => {
  if (!taskId) return
  const now = Date.now()
  updateClosedLead(id, (r) => {
    const tasks = (r.tasks || []).map((t) => {
      if (t.id !== taskId) return t
      const completed = !t.completed
      return { ...t, completed, completedAt: completed ? now : null }
    })
    return { tasks }
  })
}

export const updateClosedLeadTaskTitle = (id, taskId, title) => {
  if (!taskId) return
  updateClosedLead(id, (r) => ({
    tasks: (r.tasks || []).map((t) => (t.id === taskId ? { ...t, title: String(title ?? '').trim() } : t))
  }))
}

export const updateClosedLeadTaskSchedule = (id, taskId, scheduledAt, scheduledEndAt = null) => {
  if (!taskId) return
  updateClosedLead(id, (r) => ({
    tasks: (r.tasks || []).map((t) =>
      t.id === taskId
        ? {
            ...t,
            scheduledAt: scheduledAt && Number.isFinite(scheduledAt) ? scheduledAt : null,
            scheduledEndAt:
              scheduledEndAt !== undefined
                ? scheduledEndAt && Number.isFinite(scheduledEndAt)
                  ? scheduledEndAt
                  : null
                : t.scheduledEndAt
          }
        : t
    )
  }))
}

export const deleteClosedLeadTask = (id, taskId) => {
  if (!taskId) return
  updateClosedLead(id, (r) => ({ tasks: (r.tasks || []).filter((t) => t.id !== taskId) }))
}

// --- Contacts (skip-trace snapshot) ---
const emptyContacts = () => ({
  phone: null,
  email: null,
  phoneNumbers: [],
  emails: [],
  phoneDetails: [],
  emailDetails: [],
  address: null,
  skipTracedAt: null
})

const normalizeDetailsList = (list, existing) => {
  const byValue = new Map((existing || []).map((d) => [String(d.value).trim().toLowerCase(), d]))
  const merged = (list || []).map((d, i) => {
    const val = typeof d === 'string' ? d : (d.value ?? d)
    const key = String(val).trim().toLowerCase()
    const prev = byValue.get(key) || {}
    const base = typeof d === 'object' && d !== null ? d : { value: val }
    return {
      value: String(val).trim(),
      verified: base.verified ?? prev.verified ?? null,
      callerId: base.callerId ?? prev.callerId ?? '',
      primary: base.primary ?? prev.primary ?? (i === 0)
    }
  })
  const hasPrimary = merged.some((d) => d.primary)
  if (merged.length && !hasPrimary) merged[0] = { ...merged[0], primary: true }
  return merged
}

export const getClosedLeadContacts = (record) => record?.contacts || null

/** Replace phone or email details on a closed-lead record. */
export const updateClosedLeadContacts = (id, type, newDetails) => {
  updateClosedLead(id, (r) => {
    const data = r.contacts || emptyContacts()
    const existing =
      type === 'phone'
        ? (data.phoneDetails || [])
        : (data.emailDetails || [])
    const merged = normalizeDetailsList(newDetails, existing)
    const phoneDetails = type === 'phone' ? merged : (data.phoneDetails || [])
    const emailDetails = type === 'email' ? merged : (data.emailDetails || [])
    const phoneNumbers = phoneDetails.map((p) => p.value)
    const emails = emailDetails.map((e) => e.value)
    const primaryPhone = phoneDetails.find((p) => p.primary) || phoneDetails[0]
    const primaryEmail = emailDetails.find((e) => e.primary) || emailDetails[0]
    return {
      contacts: {
        ...data,
        phone: primaryPhone?.value || phoneNumbers[0] || null,
        email: primaryEmail?.value || emails[0] || null,
        phoneNumbers,
        emails,
        phoneDetails,
        emailDetails,
        skipTracedAt: data.skipTracedAt ?? null
      }
    }
  })
}

/** Update verified/callerId/primary for a single phone or email entry. */
export const updateClosedLeadContactMeta = (id, type, value, meta) => {
  updateClosedLead(id, (r) => {
    const data = r.contacts || emptyContacts()
    const details = type === 'phone' ? (data.phoneDetails || []) : (data.emailDetails || [])
    const idx = details.findIndex((d) => String(d.value).trim() === String(value).trim())
    if (idx < 0) return {}
    const updated = details.map((d) => ({ ...d, primary: d.primary ?? false }))
    if (meta.verified !== undefined) updated[idx] = { ...updated[idx], verified: meta.verified }
    if (meta.callerId !== undefined) updated[idx] = { ...updated[idx], callerId: meta.callerId }
    if (meta.primary === true) {
      updated.forEach((u, i) => { updated[i] = { ...u, primary: i === idx } })
    } else if (meta.primary === false) {
      updated[idx] = { ...updated[idx], primary: false }
    }
    const phoneDetails = type === 'phone' ? updated : (data.phoneDetails || [])
    const emailDetails = type === 'email' ? updated : (data.emailDetails || [])
    const primaryPhone = phoneDetails.find((p) => p.primary) || phoneDetails[0]
    const primaryEmail = emailDetails.find((e) => e.primary) || emailDetails[0]
    return {
      contacts: {
        ...data,
        phone: primaryPhone?.value || phoneDetails[0]?.value || null,
        email: primaryEmail?.value || emailDetails[0]?.value || null,
        phoneDetails,
        emailDetails
      }
    }
  })
}

/** Write a full skip-trace result (from /api/skip-trace) into the closed-lead record. */
export const saveClosedLeadSkipTraceResult = (id, contactInfo) => {
  updateClosedLead(id, (r) => {
    const existing = r.contacts || emptyContacts()
    const phoneDetails =
      contactInfo.phoneDetails ??
      existing.phoneDetails ??
      normalizeDetailsList(contactInfo.phoneNumbers || (contactInfo.phone ? [contactInfo.phone] : []), existing.phoneDetails)
    const emailDetails =
      contactInfo.emailDetails ??
      existing.emailDetails ??
      normalizeDetailsList(contactInfo.emails || (contactInfo.email ? [contactInfo.email] : []), existing.emailDetails)
    const phoneNumbers = phoneDetails.map((p) => p.value)
    const emails = emailDetails.map((e) => e.value)
    const primaryPhone = phoneDetails.find((p) => p.primary) || phoneDetails[0]
    const primaryEmail = emailDetails.find((e) => e.primary) || emailDetails[0]
    return {
      contacts: {
        phone: primaryPhone?.value || phoneNumbers[0] || null,
        email: primaryEmail?.value || emails[0] || null,
        phoneNumbers,
        emails,
        phoneDetails,
        emailDetails,
        address: contactInfo.address ?? existing.address ?? null,
        skipTracedAt: contactInfo.skipTracedAt || new Date().toISOString()
      }
    }
  })
}

/**
 * Finalize cumulativeTimeByStatus by rolling the current stint into the
 * lead's current status.
 * @param {Object} lead
 * @param {number} [closedAt=Date.now()]
 * @returns {Object} { [statusId]: totalMs }
 */
export const finalizeStageTime = (lead, closedAt = Date.now()) => {
  if (!lead) return {}
  const cum = { ...(lead.cumulativeTimeByStatus || {}) }
  const entered = lead.statusEnteredAt ?? lead.createdAt
  const ts = typeof entered === 'number' && Number.isFinite(entered) ? entered : null
  if (lead.status && ts != null && ts > 0) {
    const current = typeof cum[lead.status] === 'number' && Number.isFinite(cum[lead.status]) ? cum[lead.status] : 0
    cum[lead.status] = current + Math.max(0, closedAt - ts)
  }
  return cum
}

/**
 * Build a closed-lead record from the live lead + related data.
 * @param {Object} args
 * @param {Object} args.lead - Original lead object
 * @param {Object} args.pipeline - { id, title, isLocal, columns }
 * @param {string|null} args.parcelNote
 * @param {Array} args.tasks
 * @param {Object|null} args.contacts - skip_traced_parcels entry or null
 * @param {number} [args.closedAt=Date.now()]
 * @returns {Object} closed-lead record
 */
export const buildClosedLeadRecord = ({
  lead,
  pipeline,
  parcelNote = null,
  tasks = [],
  contacts = null,
  closedAt = Date.now()
}) => {
  if (!lead) return null
  return {
    id: lead.id,
    parcelId: lead.parcelId || null,
    closedAt,
    closedFrom: pipeline
      ? {
          pipelineId: pipeline.id || null,
          title: pipeline.title || 'Pipes',
          isLocal: !!pipeline.isLocal,
          columns: Array.isArray(pipeline.columns)
            ? pipeline.columns.map((c) => ({ id: c.id, name: c.name }))
            : []
        }
      : null,
    lead: { ...lead },
    stageTime: finalizeStageTime(lead, closedAt),
    notes: (parcelNote || '').trim() || '',
    tasks: Array.isArray(tasks) ? tasks.map((t) => ({ ...t })) : [],
    contacts: contacts ? { ...contacts } : null
  }
}
