export const ANNOTATOR_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#ffffff']

export const STROKE_SIZE_OPTIONS = [
  { id: 'S', value: 5 },
  { id: 'M', value: 10 },
  { id: 'L', value: 15 },
]

export const DEFAULT_ANNOTATOR_COLOR = '#ef4444'
export const DEFAULT_STROKE_WIDTH = 10

const STORAGE_KEY = 'photo_annotator_prefs_v1'

export function loadPhotoAnnotatorPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const strokeWidth = STROKE_SIZE_OPTIONS.some((opt) => opt.value === parsed.strokeWidth)
      ? parsed.strokeWidth
      : DEFAULT_STROKE_WIDTH
    const color = ANNOTATOR_COLORS.includes(parsed.color) ? parsed.color : DEFAULT_ANNOTATOR_COLOR
    return { color, strokeWidth }
  } catch {
    return null
  }
}

export function savePhotoAnnotatorPrefs({ color, strokeWidth }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ color, strokeWidth }))
  } catch {
    /* ignore quota / private mode */
  }
}

export function strokeSizeLabel(value) {
  return STROKE_SIZE_OPTIONS.find((opt) => opt.value === value)?.id || 'M'
}
