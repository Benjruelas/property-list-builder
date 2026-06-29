/** Normalize lead/deal entity references for upload jobs. */

export function entityKey(ref) {
  if (!ref) return ''
  const type = ref.entityType || (ref.dealId ? 'deal' : 'lead')
  if (type === 'deal') {
    return `deal:${ref.pipelineId}:${ref.dealId || ref.entityId}`
  }
  return `lead:${ref.leadId || ref.entityId}`
}

export function parseEntityKey(key) {
  if (key.startsWith('deal:')) {
    const [, pipelineId, dealId] = key.split(':')
    return { entityType: 'deal', pipelineId, dealId, entityId: dealId }
  }
  if (key.startsWith('lead:')) {
    const id = key.slice(5)
    return { entityType: 'lead', leadId: id, entityId: id }
  }
  return { entityType: 'lead', leadId: key, entityId: key }
}

export function apiBodyFromRef(ref) {
  const type = ref.entityType || (ref.dealId ? 'deal' : 'lead')
  if (type === 'deal') {
    return {
      entityType: 'deal',
      pipelineId: ref.pipelineId,
      dealId: ref.dealId || ref.entityId,
    }
  }
  return {
    entityType: 'lead',
    leadId: ref.leadId || ref.entityId,
  }
}

export function isDraftRef(ref) {
  const id = ref.leadId || ref.entityId || ''
  return String(id).startsWith('draft:')
}

export function draftSessionId() {
  return `draft:${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
