/**
 * Map lead status Tailwind color classes to solid hex for MapLibre paint.
 */

import { getLeadStatusMeta, DEFAULT_LEAD_STATUSES } from './leadStatuses'

export const LEAD_STATUS_TOKEN_HEX = {
  slate: '#64748b',
  blue: '#3b82f6',
  amber: '#f59e0b',
  green: '#22c55e',
  red: '#ef4444',
  purple: '#a855f7',
  cyan: '#06b6d4',
  orange: '#f97316',
  pink: '#ec4899',
  emerald: '#10b981',
}

const TOKEN_RE = /\b(?:bg|text|border)-(slate|blue|amber|green|red|purple|cyan|orange|pink|emerald)-\d+/

/** Convert a status color string (Tailwind classes or hex) to a #RRGGBB hex. */
export function leadStatusColorToHex(colorClass) {
  const raw = String(colorClass || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [, a, b, c] = raw
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase()
  }
  const match = raw.match(TOKEN_RE)
  if (match) return LEAD_STATUS_TOKEN_HEX[match[1]] || LEAD_STATUS_TOKEN_HEX.slate
  return LEAD_STATUS_TOKEN_HEX.slate
}

/** Hex for a status id using the lead status registry. */
export function getLeadStatusMapColor(statusId, registry = DEFAULT_LEAD_STATUSES) {
  const meta = getLeadStatusMeta(statusId, registry)
  return leadStatusColorToHex(meta?.color)
}

/** #RRGGBB → rgba() string with alpha 0–1. */
export function hexToRgba(hex, alpha = 1) {
  const h = leadStatusColorToHex(hex)
  const n = parseInt(h.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const a = Math.max(0, Math.min(1, Number(alpha)))
  return `rgba(${r},${g},${b},${a})`
}
