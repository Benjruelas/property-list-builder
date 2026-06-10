/**
 * Non-destructive annotation layer helpers for lead photos.
 */

export function normalizeAnnotationObjects(objects) {
  if (!Array.isArray(objects)) return []
  return objects.map((o, i) => ({ ...o, id: o.id || `obj_${i}` }))
}

export function serializeAnnotationLayer(objects) {
  return {
    version: 1,
    objects: normalizeAnnotationObjects(objects),
  }
}
