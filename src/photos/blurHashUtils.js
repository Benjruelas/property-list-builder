import { encode, decode } from 'blurhash'

const BLUR_SIZE = 32
const blurStyleCache = new Map()

export async function blurHashFromBlob(blob) {
  try {
    const bitmap = await createImageBitmap(blob)
    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, size, size)
    bitmap.close()
    const { data, width, height } = ctx.getImageData(0, 0, size, size)
    return encode(data, width, height, 4, 3)
  } catch {
    return null
  }
}

export function blurHashStyle(hash) {
  if (!hash) return {}
  const cached = blurStyleCache.get(hash)
  if (cached) return cached

  try {
    const pixels = decode(hash, BLUR_SIZE, BLUR_SIZE)
    const canvas = document.createElement('canvas')
    canvas.width = BLUR_SIZE
    canvas.height = BLUR_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return {}
    const imageData = ctx.createImageData(BLUR_SIZE, BLUR_SIZE)
    imageData.data.set(pixels)
    ctx.putImageData(imageData, 0, 0)
    const style = {
      backgroundImage: `url("${canvas.toDataURL('image/jpeg', 0.82)}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
    blurStyleCache.set(hash, style)
    return style
  } catch {
    return {}
  }
}
