import { useState, useEffect } from 'react'
import { fetchLeadPhotoBlob, saveLeadPhotoAnnotations } from '@/utils/leadPhotos'
import { updatePhotoInList } from '@/utils/optimisticPhotoUpload'
import { showToast } from '../ui/toast'
import { normalizeAnnotationObjects } from '@/utils/photoAnnotations'
import { PhotoAnnotatorEditor } from './PhotoAnnotatorEditor'
import { renderFlatImageBlobs } from './photoAnnotatorRender'
import { getPhotoAnnotationBaseKey } from '@/utils/photoDisplay'

export function PhotoAnnotator({ open, lead, photo, getToken, onClose, onSaved }) {
  const [image, setImage] = useState(null)
  const [initialObjects, setInitialObjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !photo) return undefined
    setLoading(true)
    const key = getPhotoAnnotationBaseKey(photo)
    if (!key) {
      showToast('Could not load photo', 'error')
      setLoading(false)
      return undefined
    }
    let objectUrl = null
    fetchLeadPhotoBlob(getToken, key)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        const img = new window.Image()
        img.onload = () => {
          setImage(img)
          setInitialObjects(normalizeAnnotationObjects(photo.annotations?.objects))
          setLoading(false)
        }
        img.onerror = () => {
          showToast('Could not load photo', 'error')
          setLoading(false)
        }
        img.src = objectUrl
      })
      .catch(() => {
        showToast('Could not load photo', 'error')
        setLoading(false)
      })
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setImage(null)
    }
  }, [open, photo, getToken])

  const handleSave = async (objects) => {
    if (!image || !photo || saving) return
    const annotations = { version: 1, objects }
    const snapshotLead = lead
    setSaving(true)

    let annotatedPreviewUrl = null
    try {
      const { file, thumbnail } = await renderFlatImageBlobs(image, objects, image.width, image.height)
      annotatedPreviewUrl = URL.createObjectURL(thumbnail)
      const optimisticPhoto = {
        ...photo,
        annotations,
        annotatedKey: photo.annotatedKey || '__pending__',
        _annotatedPreviewUrl: annotatedPreviewUrl,
        _annotationSaving: true,
        updatedAt: new Date().toISOString(),
      }
      onSaved?.({
        ...lead,
        photos: updatePhotoInList(lead.photos || [], photo.id, optimisticPhoto),
        updatedAt: optimisticPhoto.updatedAt,
      }, { complete: false })

      const { lead: updated } = await saveLeadPhotoAnnotations(getToken, {
        leadId: lead.id,
        photoId: photo.id,
        annotations,
        annotatedBlob: file,
        annotatedThumbnailBlob: thumbnail,
        existingPhotos: lead.photos || [],
      })
      onSaved?.(updated, { complete: true })
    } catch (e) {
      if (annotatedPreviewUrl) URL.revokeObjectURL(annotatedPreviewUrl)
      onSaved?.(snapshotLead, { complete: true })
      showToast(e.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!open || !photo) return null

  return (
    <PhotoAnnotatorEditor
      open={open}
      image={image}
      loading={loading}
      initialObjects={initialObjects}
      resetKey={photo.id}
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
    />
  )
}
