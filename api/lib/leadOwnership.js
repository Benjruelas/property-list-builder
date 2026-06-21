/**
 * Lead ownership helpers for photo permissions and record repair.
 */

export function uidsMatch(a, b) {
  if (a == null || b == null || a === '' || b === '') return false
  return String(a) === String(b)
}

export function normalizedOwnerId(lead) {
  const id = lead?.ownerId
  if (id == null || id === '') return null
  return String(id)
}

export function isLeadOwner(user, lead) {
  if (!user?.uid || !lead) return false
  const ownerId = normalizedOwnerId(lead)
  if (ownerId && uidsMatch(ownerId, user.uid)) return true
  const ownerEmail = (lead.ownerEmail || '').toLowerCase().trim()
  const userEmail = (user.email || '').toLowerCase().trim()
  return !!(ownerEmail && userEmail && ownerEmail === userEmail)
}

export function userCapturedPhoto(user, photo) {
  return !!(photo?.capturedByUid && uidsMatch(photo.capturedByUid, user.uid))
}

export function userCapturedAllPhotos(user, lead) {
  const photos = Array.isArray(lead?.photos) ? lead.photos : []
  if (photos.length === 0) return false
  return photos.every((p) => userCapturedPhoto(user, p))
}

/** Assign owner when missing but this user clearly owns the photo history. */
export function withRepairedLeadOwnership(lead, user) {
  if (!lead || !user?.uid) return lead
  if (normalizedOwnerId(lead)) return lead
  if (!userCapturedAllPhotos(user, lead)) return lead
  return {
    ...lead,
    ownerId: user.uid,
    ownerEmail: lead.ownerEmail || user.email || null,
  }
}
