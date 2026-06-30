import Konva from 'konva'
import { appendAnnotationObject } from './annotationKonvaRender'
import { exportCanvasVariants } from '@/utils/imageCompress'

export { DEFAULT_COLOR, DEFAULT_STROKE } from './annotationKonvaRender'

export async function renderFlatImage(image, objects, width, height) {
  const { file } = await renderFlatImageBlobs(image, objects, width, height)
  return file
}

export async function renderFlatImageBlobs(image, objects, width, height) {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  document.body.appendChild(container)

  const stage = new Konva.Stage({ container, width, height })
  const layer = new Konva.Layer()
  stage.add(layer)
  layer.add(new Konva.Image({
    image,
    x: 0,
    y: 0,
    width,
    height,
    listening: false,
  }))

  for (const obj of objects) {
    appendAnnotationObject(layer, obj, 1)
  }

  layer.batchDraw()
  const canvas = layer.toCanvas({ pixelRatio: 1 })
  stage.destroy()
  container.remove()

  const { file, thumbnail } = await exportCanvasVariants(canvas, width, height)
  return { file, thumbnail }
}
