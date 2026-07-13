import { describe, it, expect } from 'vitest'
import {
  mintQuotePreviewToken,
  mintReportPreviewToken,
  parseQuotePreviewToken,
  parseReportPreviewToken,
} from '../previewToken.js'

describe('previewToken', () => {
  it('mints and parses quote preview tokens', () => {
    const token = mintQuotePreviewToken('quote_abc123')
    expect(token).toContain('quote_abc123.')
    expect(parseQuotePreviewToken(token)).toBe('quote_abc123')
    expect(parseQuotePreviewToken('quote_abc123.bad')).toBeNull()
  })

  it('mints and parses report preview tokens', () => {
    const token = mintReportPreviewToken('preport_xyz789')
    expect(parseReportPreviewToken(token)).toBe('preport_xyz789')
  })

  it('rejects random hex-only legacy tokens', () => {
    const hex = '0cfae7d270c8f8f4e800f32b23337c392802003ded3f29fb2d972da06d13b2d8'
    expect(parseQuotePreviewToken(hex)).toBeNull()
  })
})
