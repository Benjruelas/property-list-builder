/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchPublicReport = vi.hoisted(() => vi.fn())
const splashMounts = vi.hoisted(() => ({ count: 0, unmounts: 0 }))

vi.mock('../../utils/photoReports', () => ({ fetchPublicReport }))
vi.mock('../AppLoadingScreen', () => ({
  AppLoadingScreen: function MockAppLoadingScreen({ active, message }) {
    React.useEffect(() => {
      splashMounts.count += 1
      return () => {
        splashMounts.unmounts += 1
      }
    }, [])
    return active
      ? <div data-testid="app-loading-screen" data-message={message} />
      : <div data-testid="app-loading-screen-idle" data-message={message} />
  },
}))
vi.mock('../forms/PublicFormBrand', () => ({
  PublicFormBrandBar: () => <div data-testid="brand-bar" />,
}))
vi.mock('../shared/PublicPdfDownload', () => ({
  PublicPdfDownload: () => null,
}))
vi.mock('../quotes/QuoteBrandHeader', () => ({
  QuoteBrandHeader: () => <div data-testid="quote-brand" />,
}))
vi.mock('../shared/GoogleReviewsBlock', () => ({
  GoogleReviewsBlock: () => null,
}))
vi.mock('../shared/PublicOwnerPreviewBackBar', () => ({
  PublicOwnerPreviewBackBar: () => null,
}))
vi.mock('../ui/FilePreviewOverlay', () => ({
  FilePreviewOverlay: () => null,
}))
vi.mock('../legal/LegalFooterLinks', () => ({
  LegalFooterLinks: () => null,
}))
vi.mock('@/utils/clientPreview', () => ({
  shouldShowOwnerPreviewBack: () => false,
}))
vi.mock('@/utils/apiBase', () => ({
  resolveApiUrl: (url) => url,
}))

import { PublicReportPage } from '../reports/PublicReportPage'
import { APP_LOADING_MESSAGES } from '@/config/appLoadingMessages'

describe('PublicReportPage loading splash', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    splashMounts.count = 0
    splashMounts.unmounts = 0
  })

  it('keeps AppLoadingScreen mounted after the report loads', async () => {
    let resolveFetch
    fetchPublicReport.mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve
    }))

    render(<PublicReportPage token="tok123" />)

    expect(screen.getByTestId('app-loading-screen').getAttribute('data-message'))
      .toBe(APP_LOADING_MESSAGES.report)
    expect(splashMounts.count).toBe(1)

    resolveFetch({
      report: { title: 'Inspection Report', sections: [] },
      lead: { name: 'Pat', address: '1 Main' },
      branding: null,
      message: '',
      pdfDownloadUrl: null,
      preview: false,
    })

    await waitFor(() => {
      expect(screen.getByText('Inspection Report')).toBeTruthy()
    })

    expect(screen.getByTestId('app-loading-screen-idle')).toBeTruthy()
    expect(splashMounts.unmounts).toBe(0)
    expect(splashMounts.count).toBe(1)
  })
})
