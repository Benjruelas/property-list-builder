import { describe, it, expect } from 'vitest'

describe('photo-reports-generate REPORT_PDF_VERSION import', () => {
  it('imports reportPdfMeta without ReferenceError', async () => {
    const mod = await import('../../photo-reports-generate.js')
    const meta = await import('../reportPdfMeta.js')
    expect(meta.REPORT_PDF_VERSION).toBeTruthy()
    expect(typeof mod.default).toBe('function')
  })
})
