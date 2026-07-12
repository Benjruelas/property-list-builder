import { describe, it, expect } from 'vitest'
import {
  buildQuoteDocumentHtml,
  buildReportDocumentHtml,
  publicDocumentStyles,
} from '../publicDocumentHtml.js'
import { resolveReportPhotoImageKey } from '../buildReportPdf.js'
import { reportPdfContentChanged, isReportPdfStale } from '../reportPdfMeta.js'

describe('publicDocumentHtml', () => {
  it('uses column-width pages that match the public link layout', () => {
    const quoteCss = publicDocumentStyles({ width: 544, height: 860 })
    expect(quoteCss).toContain('quote-brand-header')
    expect(quoteCss).toContain('photo-grid')
    expect(quoteCss).toContain('#f3f4f6')
    expect(quoteCss).toContain('size: 544px 860px')
    expect(quoteCss).toContain('margin: 0')
    expect(quoteCss).toContain('pdf-sheet--centered')
    expect(quoteCss).toContain('justify-content: center')

    const reportCss = publicDocumentStyles({ width: 704, height: 990 })
    expect(reportCss).toContain('size: 704px 990px')
  })

  it('builds quote HTML matching the public page structure', () => {
    const html = buildQuoteDocumentHtml({
      quote: {
        title: 'Roof Replacement',
        clientName: 'Jane Client',
        createdByName: 'Alex Rep',
        ownerEmail: 'owner@example.com',
        status: 'sent',
        taxRate: 8,
        terms: 'Net 30',
        validUntil: '2026-08-01',
        lineItems: [
          {
            id: 'a',
            name: 'Tear-off',
            description: 'Remove existing shingles',
            amount: 1200,
            quantity: 1,
            unitCost: 1200,
            markupPercent: 0,
            unitPrice: 1200,
            isOptional: false,
          },
          {
            id: 'b',
            name: 'Gutter guard',
            amount: 400,
            quantity: 1,
            unitCost: 400,
            markupPercent: 0,
            unitPrice: 400,
            isOptional: true,
          },
        ],
      },
      invite: {
        recipientEmail: 'jane@example.com',
        message: 'Thanks for meeting with us.',
      },
      branding: {
        businessName: 'Summit Roofing',
        logoBase64: 'data:image/png;base64,abc',
        senderName: 'Fallback',
        senderEmail: 'hello@summit.test',
      },
    })

    expect(html).toContain('Roof Replacement')
    expect(html).toContain('Prepared for Jane Client')
    expect(html).toContain('Thanks for meeting with us.')
    expect(html).toContain('Tear-off')
    expect(html).toContain('Gutter guard')
    expect(html).toContain('Add-on')
    expect(html).toContain('Summit Roofing')
    expect(html).toContain('Alex Rep')
    expect(html).toContain('hello@summit.test')
    expect(html).toContain('Net 30')
    expect(html).toContain('Valid until 2026-08-01')
    // Pending quotes show all lines like the HTML page (not required-only).
    expect(html).toContain('$1,200.00')
    expect(html).toContain('$400.00')
    // Required-only total (optional not selected yet).
    expect(html).toMatch(/Total[\s\S]*\$1,296\.00/)
    expect(html).toContain('size: 544px 860px')
  })

  it('builds accepted quote with selected add-ons only', () => {
    const html = buildQuoteDocumentHtml({
      quote: {
        title: 'Accepted Quote',
        status: 'accepted',
        acceptedLineIds: ['a', 'b'],
        acceptedSubtotal: 1600,
        acceptedTax: 0,
        acceptedTotal: 1600,
        taxRate: 0,
        lineItems: [
          { id: 'a', name: 'Base', amount: 1200, unitCost: 1200, markupPercent: 0, unitPrice: 1200, isOptional: false },
          { id: 'b', name: 'Upgrade', amount: 400, unitCost: 400, markupPercent: 0, unitPrice: 400, isOptional: true },
          { id: 'c', name: 'Skipped', amount: 50, unitCost: 50, markupPercent: 0, unitPrice: 50, isOptional: true },
        ],
      },
      invite: {},
      branding: null,
    })

    expect(html).toContain('Base')
    expect(html).toContain('Upgrade')
    expect(html).not.toContain('Skipped')
    expect(html).toContain('$1,600.00')
  })

  it('builds report HTML with brand header, message, and photo grid', () => {
    const html = buildReportDocumentHtml({
      report: {
        title: 'Inspection Report',
        sections: [
          {
            id: 's1',
            subtitle: 'North elevation',
            description: 'Hail hits visible',
            order: 0,
            photoIds: ['p1', 'p2'],
          },
        ],
      },
      lead: { name: 'Pat Homeowner', address: '123 Main St' },
      branding: {
        businessName: 'Storm Pros',
        senderName: 'Casey',
        senderEmail: 'casey@storm.test',
      },
      message: 'Here is your report.',
      photos: [
        { id: 'p1', dataUri: 'data:image/jpeg;base64,/9j/abc', caption: 'Hit 1' },
        { id: 'p2', dataUri: 'data:image/jpeg;base64,/9j/def', caption: 'Hit 2' },
      ],
    })

    expect(html).toContain('Inspection Report')
    expect(html).toContain('Prepared for Pat Homeowner')
    expect(html).toContain('123 Main St')
    expect(html).toContain('Here is your report.')
    expect(html).toContain('North elevation')
    expect(html).toContain('Hail hits visible')
    expect(html).toContain('photo-grid')
    expect(html).toContain('photo-row')
    expect(html).toContain('data-pdf-block')
    expect(html).toContain('data:image/jpeg;base64,/9j/abc')
    expect(html).toContain('Storm Pros')
    expect(html).toContain('Casey')
    expect(html).toContain('size: 704px 990px')
  })
})

describe('resolveReportPhotoImageKey', () => {
  it('prefers annotated thumbnail then thumbnail then full keys', () => {
    expect(resolveReportPhotoImageKey({
      annotatedThumbnailKey: 'a-thumb',
      thumbnailKey: 'thumb',
      annotatedKey: 'ann',
      key: 'full',
    })).toBe('a-thumb')
    expect(resolveReportPhotoImageKey({
      thumbnailKey: 'thumb',
      annotatedKey: 'ann',
      key: 'full',
    })).toBe('thumb')
    expect(resolveReportPhotoImageKey({
      annotatedKey: 'ann',
      key: 'full',
    })).toBe('ann')
    expect(resolveReportPhotoImageKey({ key: 'full' })).toBe('full')
    expect(resolveReportPhotoImageKey(null)).toBe(null)
  })
})

describe('isReportPdfStale', () => {
  it('treats missing pdfKey or outdated pdfVersion as stale', () => {
    expect(isReportPdfStale({ pdfKey: null })).toBe(true)
    expect(isReportPdfStale({ pdfKey: 'report-pdfs/u/r.pdf' })).toBe(true)
    expect(isReportPdfStale({ pdfKey: 'report-pdfs/u/r.pdf', pdfVersion: 1 })).toBe(true)
    expect(isReportPdfStale({ pdfKey: 'report-pdfs/u/r.pdf', pdfVersion: 2 })).toBe(true)
    expect(isReportPdfStale({ pdfKey: 'report-pdfs/u/r.pdf', pdfVersion: 3 })).toBe(true)
    expect(isReportPdfStale({ pdfKey: 'report-pdfs/u/r.pdf', pdfVersion: 4 })).toBe(false)
  })
})

describe('reportPdfContentChanged', () => {
  it('detects title and section changes', () => {
    const base = {
      title: 'A',
      sections: [{ id: '1', subtitle: 'S', photoIds: ['p1'] }],
    }
    expect(reportPdfContentChanged(base, { ...base })).toBe(false)
    expect(reportPdfContentChanged(base, { ...base, title: 'B' })).toBe(true)
    expect(reportPdfContentChanged(base, {
      ...base,
      sections: [{ id: '1', subtitle: 'S', photoIds: ['p1', 'p2'] }],
    })).toBe(true)
  })
})
