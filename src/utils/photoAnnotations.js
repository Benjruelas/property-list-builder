/**
 * Non-destructive annotation layer helpers for lead photos.
 */

import {
  DEFAULT_TEXT_WIDTH,
  DEFAULT_TEXT_HEIGHT,
  DEFAULT_TEXT_FONT_SIZE,
} from '../components/photos/annotationGeometry'

export function normalizeAnnotationObjects(objects) {
  if (!Array.isArray(objects)) return []
  return objects.map((o, i) => {
    const obj = { ...o, id: o.id || `obj_${i}` }
    if (obj.type === 'text') {
      obj.fontSize = obj.fontSize || DEFAULT_TEXT_FONT_SIZE
      obj.width = obj.width || DEFAULT_TEXT_WIDTH
      obj.height = obj.height || DEFAULT_TEXT_HEIGHT
    }
    return obj
  })
}

export function serializeAnnotationLayer(objects) {
  return {
    version: 1,
    objects: normalizeAnnotationObjects(objects),
  }
}
