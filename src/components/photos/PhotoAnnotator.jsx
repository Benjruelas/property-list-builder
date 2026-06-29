import { useState, useEffect } from 'react'
import { fetchPhotoBlob } from '@/photos/photosClient'
import { savePhotoAnnotations, updatePhotoInList, entityRefFromLead } from '@/photos/annotationSave'
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
    fetchPhotoBlob(getToken, key)
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

    try {
      const { file, thumbnail } = await renderFlatImageBlobs(image, objects, image.width, image.height)
      const entityRef = entityRefFromLead(lead)

      const result = await savePhotoAnnotations(getToken, entityRef, {
        photo,
        annotations,
        annotatedBlob: file,
        annotatedThumbnailBlob: thumbnail,
        existingPhotos: lead.photos || [],
        onOptimistic: (optimisticPhoto) => {
          onSaved?.({
            ...lead,
            photos: updatePhotoInList(lead.photos || [], photo.id, optimisticPhoto),
            updatedAt: optimisticPhoto.updatedAt,
          }, { complete: false })
        },
      })
      onSaved?.(result.entity, { complete: true })
    } catch {
      onSaved?.(snapshotLead, { complete: true })
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
