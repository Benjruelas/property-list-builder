/**
 * Shared Tailwind class palette for lead/deal status badges.
 * Hex values match leadStatusMapColors LEAD_STATUS_TOKEN_HEX for map pins / swatches.
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

/** Swatch metadata for settings color pickers. */
export const STATUS_COLOR_SWATCHES = [
  { color: STATUS_COLOR_PALETTE[0], hex: '#64748b', label: 'Slate' },
  { color: STATUS_COLOR_PALETTE[1], hex: '#3b82f6', label: 'Blue' },
  { color: STATUS_COLOR_PALETTE[2], hex: '#f59e0b', label: 'Amber' },
  { color: STATUS_COLOR_PALETTE[3], hex: '#22c55e', label: 'Green' },
  { color: STATUS_COLOR_PALETTE[4], hex: '#ef4444', label: 'Red' },
  { color: STATUS_COLOR_PALETTE[5], hex: '#a855f7', label: 'Purple' },
  { color: STATUS_COLOR_PALETTE[6], hex: '#06b6d4', label: 'Cyan' },
  { color: STATUS_COLOR_PALETTE[7], hex: '#f97316', label: 'Orange' },
  { color: STATUS_COLOR_PALETTE[8], hex: '#ec4899', label: 'Pink' },
  { color: STATUS_COLOR_PALETTE[9], hex: '#10b981', label: 'Emerald' },
]

const PALETTE_SET = new Set(STATUS_COLOR_PALETTE)

/** Keep a known palette color; otherwise use fallback. */
export function resolveStatusColor(raw, fallback) {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed && PALETTE_SET.has(trimmed)) return trimmed
  if (typeof fallback === 'string' && PALETTE_SET.has(fallback)) return fallback
  return STATUS_COLOR_PALETTE[0]
}
