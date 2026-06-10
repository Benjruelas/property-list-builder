/**
 * Client-side image resize/compress for lead photo uploads.
 */

const MAX_WIDTH = 1920
const THUMB_WIDTH = 320
const JPEG_QUALITY = 0.85
const THUMB_QUALITY = 0.75

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Invalid image'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

async function resizeToBlob(img, maxWidth, quality) {
  const scale = img.width > maxWidth ? maxWidth / img.width : 1
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(img, 0, 0, w, h)
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  if (!blob) throw new Error('Could not compress image')
  return { blob, width: w, height: h }
}

export async function compressImageFile(file) {
  const img = await loadImageFromFile(file)
  const [main, thumb] = await Promise.all([
    resizeToBlob(img, MAX_WIDTH, JPEG_QUALITY),
    resizeToBlob(img, THUMB_WIDTH, THUMB_QUALITY),
  ])
  return {
    file: main.blob,
    thumbnail: thumb.blob,
    width: main.width,
    height: main.height,
  }
}

export async function compressDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = async () => {
      try {
        const [main, thumb] = await Promise.all([
          resizeToBlob(img, MAX_WIDTH, JPEG_QUALITY),
          resizeToBlob(img, THUMB_WIDTH, THUMB_QUALITY),
        ])
        resolve({
          file: main.blob,
          thumbnail: thumb.blob,
          width: main.width,
          height: main.height,
        })
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => reject(new Error('Invalid image'))
    img.src = dataUrl
  })
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const base64 = result.replace(/^data:[^;]+;base64,/, '')
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(blob)
  })
}
