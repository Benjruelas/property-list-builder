import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { resolvePreviewKind } from '@/utils/filePreview'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web'),
  },
}))

const savePhotoToNativeGallery = vi.fn()
vi.mock('@/utils/savePhotoNative.js', () => ({
  savePhotoToNativeGallery,
  SavePhotoNativeError: class SavePhotoNativeError extends Error {
    constructor(code, message) {
      super(message)
      this.code = code
    }
  },
}))

describe('resolvePreviewKind', () => {
  it('detects images by mime or extension', () => {
    expect(resolvePreviewKind({ contentType: 'image/jpeg', fileName: 'x' })).toBe('image')
    expect(resolvePreviewKind({ fileName: 'photo.PNG' })).toBe('image')
  })

  it('detects PDFs by mime or extension', () => {
    expect(resolvePreviewKind({ contentType: 'application/pdf' })).toBe('pdf')
    expect(resolvePreviewKind({ fileName: 'contract.pdf' })).toBe('pdf')
  })

  it('detects text files', () => {
    expect(resolvePreviewKind({ contentType: 'text/plain' })).toBe('text')
    expect(resolvePreviewKind({ fileName: 'notes.csv' })).toBe('text')
  })

  it('marks unknown types as unsupported', () => {
    expect(resolvePreviewKind({ contentType: 'application/vnd.ms-excel', fileName: 'sheet.xlsx' })).toBe('unsupported')
    expect(resolvePreviewKind({})).toBe('unsupported')
  })
})

describe('save helpers', () => {
  it('sanitizes download file names', async () => {
    const { safeDownloadFileName, ensureImageFileName } = await import('@/utils/filePreview')
    expect(safeDownloadFileName('Photo 6/29/2026')).toBe('Photo 6-29-2026')
    expect(ensureImageFileName('Photo 1', 'image/jpeg')).toBe('Photo 1.jpg')
    expect(ensureImageFileName('shot.png', 'image/jpeg')).toBe('shot.png')
  })
})

describe('saveBlobToDevice routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    savePhotoToNativeGallery.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses native gallery save on Capacitor for images', async () => {
    const { Capacitor } = await import('@capacitor/core')
    Capacitor.isNativePlatform.mockReturnValue(true)

    const { saveBlobToDevice } = await import('@/utils/filePreview')
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const onToast = vi.fn()

    const result = await saveBlobToDevice(blob, 'photo.jpg', { onToast })

    expect(result).toBe('native')
    expect(savePhotoToNativeGallery).toHaveBeenCalledWith(blob, 'photo.jpg')
    expect(onToast).toHaveBeenCalledWith('Saved to Photos', 'success')
  })

  it('falls back to download for non-images on native', async () => {
    const { Capacitor } = await import('@capacitor/core')
    Capacitor.isNativePlatform.mockReturnValue(true)

    const click = vi.fn()
    vi.stubGlobal('document', {
      createElement: () => ({ click, href: '', download: '' }),
    })

    const { saveBlobToDevice } = await import('@/utils/filePreview')
    const blob = new Blob(['x'], { type: 'application/pdf' })

    const result = await saveBlobToDevice(blob, 'doc.pdf')

    expect(result).toBe('download')
    expect(savePhotoToNativeGallery).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
  })

  it('surfaces permission denied without throwing on web share cancel', async () => {
    const { Capacitor } = await import('@capacitor/core')
    Capacitor.isNativePlatform.mockReturnValue(false)

    const { SavePhotoNativeError } = await import('@/utils/savePhotoNative.js')
    savePhotoToNativeGallery.mockRejectedValue(new SavePhotoNativeError('permission_denied', 'denied'))

    Capacitor.isNativePlatform.mockReturnValue(true)
    const { saveBlobToDevice } = await import('@/utils/filePreview')
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const onToast = vi.fn()

    await expect(saveBlobToDevice(blob, 'photo.jpg', { onToast })).rejects.toMatchObject({ code: 'permission_denied' })
    expect(onToast).toHaveBeenCalledWith('Enable Photos access in Settings to save images', 'error')
  })
})
