/** Seed palette — extended automatically so every path gets a unique color. */
export const PATH_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#e11d48',
]

const GOLDEN_ANGLE = 137.508

function hslToHex(h, s, l) {
  const sat = s / 100
  const lit = l / 100
  const k = (n) => (n + h / 30) % 12
  const a = sat * Math.min(lit, 1 - lit)
  const f = (n) => lit - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, '0')
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

/** Unique color for slot N (palette first, then golden-angle hues). */
export function colorAtIndex(index) {
  const i = Math.max(0, Number(index) || 0)
  if (i < PATH_COLORS.length) return PATH_COLORS[i]
  const hue = (i * GOLDEN_ANGLE) % 360
  return hslToHex(hue, 72, 52)
}

/** Oldest path → index 0; new paths append without reusing freed slots. */
export function sortPathsForColorAssignment(paths) {
  return [...(paths || [])].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime()
    const tb = new Date(b.createdAt || 0).getTime()
    if (ta !== tb) return ta - tb
    return String(a.id || '').localeCompare(String(b.id || ''))
  })
}

/** Map path id → unique hex color (no reuse among current paths). */
export function buildPathColorMap(paths) {
  const map = new Map()
  sortPathsForColorAssignment(paths).forEach((path, index) => {
    if (path?.id) map.set(path.id, colorAtIndex(index))
  })
  return map
}

export function getPathColor(pathId, colorMap) {
  if (colorMap?.get) return colorMap.get(pathId) ?? colorAtIndex(0)
  return colorAtIndex(0)
}

/** Map glow layer — 8-digit hex with ~30% alpha */
export function pathGlowFromColor(hex) {
  return `${hex || colorAtIndex(0)}4D`
}
