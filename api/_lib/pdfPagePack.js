/**
 * Pack measured block heights into pages that fit within usableHeight.
 * Pure helper so pagination behavior can be unit-tested.
 *
 * @param {number[]} heights
 * @param {number} usableHeight
 * @returns {number[][]} pages of block indices
 */
export function packBlockHeights(heights, usableHeight) {
  const pages = []
  let current = []
  let used = 0
  const limit = Math.max(1, usableHeight)

  for (let i = 0; i < heights.length; i++) {
    const h = Math.max(0, Math.ceil(Number(heights[i]) || 0))
    const fits = current.length === 0 || used + h <= limit
    if (!fits) {
      pages.push(current)
      current = []
      used = 0
    }
    current.push(i)
    used += h
  }
  if (current.length) pages.push(current)
  return pages
}
