import { blobToBase64 } from '@/utils/imageCompress'
import { ensureImageFileName } from '@/utils/filePreview'
import { Media } from '@capacitor-community/media'
import { Filesystem, Directory } from '@capacitor/filesystem'

export class SavePhotoNativeError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'SavePhotoNativeError'
    this.code = code
  }
}

/**
 * Save an image blob to the device Photos / Gallery (Capacitor native only).
 */
export async function savePhotoToNativeGallery(blob, fileName) {
  if (!(blob instanceof Blob)) {
    throw new SavePhotoNativeError('save_failed', 'Invalid image data')
  }

  const mime = blob.type || 'image/jpeg'
  const name = ensureImageFileName(fileName, mime)
  const dataUrl = await blobToBase64(blob)

  try {
    await Media.savePhoto({ path: dataUrl, fileName: name.replace(/\.[^.]+$/, '') })
    return { ok: true }
  } catch (firstErr) {
    // Fallback: write to cache and save by file URI (some Android builds prefer paths).
    try {
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
      const written = await Filesystem.writeFile({
        path: name,
        data: base64,
        directory: Directory.Cache,
      })
      await Media.savePhoto({ path: written.uri, fileName: name.replace(/\.[^.]+$/, '') })
      await Filesystem.deleteFile({ path: name, directory: Directory.Cache }).catch(() => {})
      return { ok: true }
    } catch (secondErr) {
      const code = secondErr?.code || firstErr?.code
      const msg = String(secondErr?.message || firstErr?.message || 'Could not save to Photos')
      if (code === 'accessDenied' || /denied|permission|access/i.test(msg)) {
        throw new SavePhotoNativeError('permission_denied', msg)
      }
      throw new SavePhotoNativeError('save_failed', msg)
    }
  }
}
