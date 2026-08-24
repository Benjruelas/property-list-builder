/**
 * Shared Tailwind class palette for lead/deal status badges (server copy).
 * Keep in sync with src/utils/statusColorPalette.js.
 */

export const STATUS_COLOR_PALETTE = [
  'bg-slate-500/25 text-slate-200 border-slate-400/40',
  'bg-blue-500/20 text-blue-200 border-blue-400/40',
  'bg-amber-500/20 text-amber-200 border-amber-400/40',
  'bg-green-500/20 text-green-200 border-green-400/40',
  'bg-red-500/20 text-red-200 border-red-400/40',
  'bg-purple-500/20 text-purple-200 border-purple-400/40',
  'bg-cyan-500/20 text-cyan-200 border-cyan-400/40',
  'bg-orange-500/20 text-orange-200 border-orange-400/40',
  'bg-pink-500/20 text-pink-200 border-pink-400/40',
  'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
]

const PALETTE_SET = new Set(STATUS_COLOR_PALETTE)

/** Keep a known palette color; otherwise use fallback. */
export function resolveStatusColor(raw, fallback) {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed && PALETTE_SET.has(trimmed)) return trimmed
  if (typeof fallback === 'string' && PALETTE_SET.has(fallback)) return fallback
  return STATUS_COLOR_PALETTE[0]
}
