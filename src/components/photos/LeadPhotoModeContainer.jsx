import { useEffect, useCallback } from 'react'
import { formatLeadAddress } from '@/utils/leads'
import { uploadLeadPhoto, getCurrentPosition } from '@/utils/leadPhotos'
import { logLeadPhotosAdded } from '@/utils/leadActivity'
import { useBackgroundPhotoUploadQueue } from '@/hooks/useBackgroundPhotoUploadQueue'
import { PhotoMode } from './PhotoMode'

/** PhotoMode wired with optimistic background uploads (map / standalone entry). */
export function LeadPhotoModeContainer({
  lead,
  parcelId = null,
  addressLabel = '',
  getToken,
  currentUser,
  onClose,
  onLeadChange,
  onLeadCreated,
  teams = [],
  teamMembership = null,
  existingLeads = [],
}) {
  const uploadOne = useCallback(async (source, existingPhotos, entity) => {
    const pos = await getCurrentPosition()
    const name = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'
    const result = await uploadLeadPhoto(getToken, {
      leadId: entity.id,
      file: typeof source === 'string' ? undefined : source,
      dataUrl: typeof source === 'string' ? source : undefined,
      existingPhotos,
      metadata: {
        capturedByName: name,
        lat: pos?.lat ?? entity.lat ?? null,
        lng: pos?.lng ?? entity.lng ?? null,
        addressLabel: addressLabel || formatLeadAddress(entity) || entity.address || '',
        parcelId: parcelId || entity.parcelId || null,
      },
    })
    return { entity: result.lead, photo: result.photo, thumbnailBlob: result.thumbnailBlob }
  }, [getToken, currentUser, parcelId, addressLabel])

  const { enqueue, setEntity, uploadingCount } = useBackgroundPhotoUploadQueue({
    getToken,
    uploadOne,
    onEntityUpdated: onLeadChange,
    logActivity: async (entity) => {
      if (entity?.id) await logLeadPhotosAdded(getToken, entity.id, 1)
    },
  })

  useEffect(() => {
    if (lead) setEntity(lead)
  }, [lead, setEntity])

  const handleEnqueueUpload = useCallback((source, meta = {}, entityOverride) => {
    const target = entityOverride || lead
    if (!target?.id) return null
    return enqueue(source, target, meta)
  }, [enqueue, lead])

  return (
    <PhotoMode
      open
      lead={lead}
      parcelId={parcelId}
      addressLabel={addressLabel}
      getToken={getToken}
      currentUser={currentUser}
      onClose={onClose}
      onPhotosUploaded={onLeadChange}
      onEnqueueUpload={handleEnqueueUpload}
      uploadingCount={uploadingCount}
      onLeadCreated={onLeadCreated}
      teams={teams}
      teamMembership={teamMembership}
      existingLeads={existingLeads}
    />
  )
}
