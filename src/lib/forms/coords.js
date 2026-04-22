/**
 * Coordinate helpers for form fields.
 *
 * Field rectangles are stored in the template JSON as fractions of the page
 * (x, y, width, height all in [0, 1]) so the layout is resolution-independent.
 * The top-left of the page is (0, 0); y grows downward in screen space.
 *
 * PDF.js renders with a viewport whose origin is also top-left, so screen
 * conversions are straightforward multiplies.
 *
 * pdf-lib, in contrast, uses PDF-points with origin at the bottom-left, so
 * a separate helper (`pctToPdfPoints`) is provided for the flatten worker.
 */

function clamp01(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

/**
 * Convert a percentage-space field to a pixel-space rectangle (top-left origin).
 * @param {{x:number,y:number,width:number,height:number}} field
 * @param {{width:number,height:number}} pageSize
 * @returns {{x:number,y:number,width:number,height:number}}
 */
export function pctToPx(field, pageSize) {
  if (!field || !pageSize) return { x: 0, y: 0, width: 0, height: 0 }
  const { width: W, height: H } = pageSize
  return {
    x: clamp01(field.x) * W,
    y: clamp01(field.y) * H,
    width: clamp01(field.width) * W,
    height: clamp01(field.height) * H,
  }
}

/**
 * Convert a pixel-space rectangle (top-left origin) back into percentage-space.
 * Negative widths/heights and out-of-bounds values are clamped to [0, 1].
 * @param {{x:number,y:number,width:number,height:number}} rect
 * @param {{width:number,height:number}} pageSize
 */
export function pxToPct(rect, pageSize) {
  if (!rect || !pageSize || !pageSize.width || !pageSize.height) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const { width: W, height: H } = pageSize
  return {
    x: clamp01(rect.x / W),
    y: clamp01(rect.y / H),
    width: clamp01(rect.width / W),
    height: clamp01(rect.height / H),
  }
}

/**
 * Convert a percentage-space field to pdf-lib coordinates (PDF points, origin
 * bottom-left). `pageSize` is the PDF page size from pdf-lib's getSize().
 * Returns { x, y, width, height } with y measured from the bottom.
 */
export function pctToPdfPoints(field, pageSize) {
  if (!field || !pageSize) return { x: 0, y: 0, width: 0, height: 0 }
  const { width: W, height: H } = pageSize
  const x = clamp01(field.x) * W
  const yTop = clamp01(field.y) * H
  const width = clamp01(field.width) * W
  const height = clamp01(field.height) * H
  return { x, y: H - yTop - height, width, height }
}

export const __test__ = { clamp01 }
