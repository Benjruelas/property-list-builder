import { useState, useEffect } from 'react'
import { fetchPhotoBlob } from '@/photos/photosClient'
import { savePhotoAnnotations, updatePhotoInList, entityRefFromDeal } from '@/photos/annotationSave'
import { showToast } from '../ui/toast'
import { normalizeAnnotationObjects } from '@/utils/photoAnnotations'
import { PhotoAnnotatorEditor } from './PhotoAnnotatorEditor'
import { renderFlatImageBlobs } from './photoAnnotatorRender'
import { getPhotoAnnotationBaseKey } from '@/utils/photoDisplay'

export function DealPhotoAnnotator({ open, deal, pipelineId, photo, getToken, onClose, onSaved }) {
  const [image, setImage] = useState(null)
  const [initialObjects, setInitialObjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !photo?.id) return undefined

    let cancelled = false
    let objectUrl = null
    const annotationObjects = photo.annotations?.objects
    const key = getPhotoAnnotationBaseKey(photo)

    setImage(null)
    setInitialObjects([])
    setLoading(true)

    if (!key) {
      showToast('Could not load photo', 'error')
      setLoading(false)
      return undefined
    }

    fetchPhotoBlob(getToken, key)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        const img = new window.Image()
        img.onload = () => {
          if (cancelled) return
          setImage(img)
          setInitialObjects(normalizeAnnotationObjects(annotationObjects))
          setLoading(false)
        }
        img.onerror = () => {
          if (cancelled) return
          showToast('Could not load photo', 'error')
          setLoading(false)
        }
        img.src = objectUrl
      })
      .catch(() => {
        if (cancelled) return
        showToast('Could not load photo', 'error')
        setLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setImage(null)
      setInitialObjects([])
    }
  }, [open, photo?.id, photo?.key, photo?.updatedAt, getToken])

  const handleSave = async (objects) => {
    if (!image || !photo || !deal?.id || !pipelineId || saving) return
    const annotations = { version: 1, objects }
    setSaving(true)

    try {
      const { file, thumbnail } = await renderFlatImageBlobs(image, objects, image.width, image.height)
      const entityRef = entityRefFromDeal(deal, pipelineId)
      setSaving(false)

      void savePhotoAnnotations(getToken, entityRef, {
        photo,
        annotations,
        annotatedBlob: file,
        annotatedThumbnailBlob: thumbnail,
        existingPhotos: deal.photos || [],
        onOptimistic: (optimisticPhoto) => {
          onSaved?.({
            ...deal,
            photos: updatePhotoInList(deal.photos || [], photo.id, optimisticPhoto),
            updatedAt: optimisticPhoto.updatedAt,
          }, { complete: false })
        },
      })
        .then((result) => {
          onSaved?.(result.entity, { complete: true })
        })
        .catch(() => {
          /* failure reflected via onOptimistic retry payload */
        })
    } catch {
      setSaving(false)
      showToast('Could not save annotations', 'error')
    }
  }

  if (!open || !photo) return null

  return (
    <PhotoAnnotatorEditor
      key={photo.id}
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
