import { encode } from 'blurhash'

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
  return {
    backgroundImage: `url("https://blurhash.vercel.app/${encodeURIComponent(hash)}/32/32")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}
