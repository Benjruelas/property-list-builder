import { describe, expect, it } from 'vitest'
import { resolvePreviewKind } from '@/utils/filePreview'

describe('resolvePreviewKind', () => {
  it('detects images by mime or extension', () => {
    expect(resolvePreviewKind({ contentType: 'image/jpeg', fileName: 'x' })).toBe('image')
    expect(resolvePreviewKind({ fileName: 'photo.PNG' })).toBe('image')
  })

  it('detects PDFs by mime or extension', () => {
    expect(resolvePreviewKind({ contentType: 'application/pdf' })).toBe('pdf')
    expect(resolvePreviewKind({ fileName: 'contract.pdf' })).toBe('pdf')
  })

  it('detects text files', () => {
    expect(resolvePreviewKind({ contentType: 'text/plain' })).toBe('text')
    expect(resolvePreviewKind({ fileName: 'notes.csv' })).toBe('text')
  })

  it('marks unknown types as unsupported', () => {
    expect(resolvePreviewKind({ contentType: 'application/vnd.ms-excel', fileName: 'sheet.xlsx' })).toBe('unsupported')
    expect(resolvePreviewKind({})).toBe('unsupported')
  })
})
