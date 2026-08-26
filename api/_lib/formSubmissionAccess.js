import { getLeadWithAccess } from './leadAccess.js'
import { getResourceAccess, canView, canEdit } from './resourceContext.js'

/**
 * Whether the user may view/download a submission (template access or lead access).
 */
export async function canViewFormSubmission(sub, user, ctx, templateById) {
  const template = templateById.get(sub.templateId)
  const templateAccess = template ? getResourceAccess(template, user, ctx) : null
  if (canView(templateAccess)) return true

  if (!sub.leadId) return false
  const { lead, access } = await getLeadWithAccess(user, sub.leadId)
  return !!lead && !!access
}

/**
 * Whether the user may delete a submission (template edit or lead edit).
 */
export async function canDeleteFormSubmission(sub, user, ctx, templateById) {
  const template = templateById.get(sub.templateId)
  const templateAccess = template ? getResourceAccess(template, user, ctx) : null
  if (canEdit(templateAccess)) return true

  if (!sub.leadId) return false
  const { lead, access } = await getLeadWithAccess(user, sub.leadId)
  return !!lead && canEdit(access)
}
