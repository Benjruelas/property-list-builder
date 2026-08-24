import { useEffect, useState, useMemo } from 'react'
import { CheckCircle2, AlertCircle, CreditCard } from 'lucide-react'
import { fetchPublicQuote, respondToPublicQuote, createQuoteCheckout } from '../../utils/quotes'
import { computeQuoteTotals, formatQuoteMoney } from '../../utils/quoteMath'
import { PublicFormBrandBar } from '../forms/PublicFormBrand'
import { PublicPdfDownload } from '../shared/PublicPdfDownload'
import { QuoteBrandHeader } from './QuoteBrandHeader'
import { QuoteCheckToggle } from './QuoteCheckToggle'
import { GoogleReviewsBlock } from '../shared/GoogleReviewsBlock'
import { cn } from '@/lib/utils'
import { PublicOwnerPreviewBackBar } from '../shared/PublicOwnerPreviewBackBar'
import { shouldShowOwnerPreviewBack } from '@/utils/clientPreview'
import { AppLoadingScreen } from '../AppLoadingScreen'
import { APP_LOADING_MESSAGES } from '@/config/appLoadingMessages'
import { LegalConsentCheckbox } from '../legal/LegalConsentCheckbox'
import { LegalFooterLinks } from '../legal/LegalFooterLinks'
import { buildLegalConsentPayload } from '../../legal/legalMeta'
import { showToast } from '../ui/toast'

export function PublicQuotePage({ token }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selectedOptionalIds, setSelectedOptionalIds] = useState([])
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [paymentParam] = useState(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('payment') : null
  )

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await fetchPublicQuote(token)
      setData(d)
      if (d.acceptedLineIds && d.optionalLineIds?.length) {
        setSelectedOptionalIds(d.acceptedLineIds.filter((id) => d.optionalLineIds.includes(id)))
      } else {
        setSelectedOptionalIds([])
      }
    } catch (e) {
      setError(e.message || 'Unable to load quote')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [token])

  const liveTotals = useMemo(() => {
    if (!data?.lineItems) return null
    const isLocked = ['accepted', 'paid'].includes(data.status)
    const optionalSelection = isLocked
      ? (data.acceptedLineIds || []).filter((id) => (data.optionalLineIds || []).includes(id))
      : selectedOptionalIds
    return computeQuoteTotals(data.lineItems, data.taxRate || 0, {
      selectedOptionalIds: optionalSelection,
    })
  }, [data, selectedOptionalIds])

  const isPreview = !!data?.preview
  const showOwnerBack = shouldShowOwnerPreviewBack({ preview: isPreview })

  const isRespondableStatus = useMemo(() => {
    if (!data) return false
    return !['accepted', 'declined', 'paid', 'change_requested'].includes(data.status)
  }, [data])

  const canRespond = isRespondableStatus && !isPreview

  const showPayButton =
    data?.status === 'accepted' && data?.paymentEnabled && data?.status !== 'paid' && data?.stripeConfigured

  const toggleOptional = (id) => {
    setSelectedOptionalIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleRespond = async (action) => {
    if (action === 'accept' && !legalAccepted) {
      showToast('Please accept the terms before accepting this quote.', 'error')
      return
    }
    setSubmitting(true)
    try {
      const res = await respondToPublicQuote(token, {
        action,
        message: message.trim(),
        selectedOptionalIds: action === 'accept' ? selectedOptionalIds : undefined,
        consent: action === 'accept' ? buildLegalConsentPayload() : undefined,
      })
      setData((prev) => ({ ...prev, ...res.quote, status: res.status }))
      if (res.canPay) {
        /* user can click pay */
      }
    } catch (e) {
      setError(e.message || 'Failed to submit response')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePay = async () => {
    setSubmitting(true)
    try {
      const { checkoutUrl } = await createQuoteCheckout(token)
      if (checkoutUrl) window.location.href = checkoutUrl
    } catch (e) {
      setError(e.message || 'Could not start payment')
      setSubmitting(false)
    }
  }

  const pageClass = cn('public-form-page flex flex-col h-[100dvh] overflow-hidden bg-gray-100 text-gray-900')
  const displayTotal = liveTotals?.total ?? data?.total ?? 0
  const optionalIds = new Set(data?.optionalLineIds || [])
  const branding = data?.branding

  const brandChrome = branding ? (
    <QuoteBrandHeader
      variant="public"
      className="quote-brand-header--page"
      businessName={branding.businessName}
      logoBase64={branding.logoBase64}
      senderName={branding.senderName}
      senderEmail={branding.senderEmail}
    />
  ) : (
    <PublicFormBrandBar className="public-form-brand-bar--page" />
  )

  if (loading) {
    return <AppLoadingScreen active message={APP_LOADING_MESSAGES.quote} />
  }

  if (error && !data) {
    return (
      <div className={pageClass}>
        <PublicFormBrandBar className="public-form-brand-bar--page" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
          <h1 className="text-lg font-semibold mb-2">Quote unavailable</h1>
          <p className="text-sm text-gray-600 max-w-md">{error}</p>
        </div>
      </div>
    )
  }

  if (data?.status === 'paid' || paymentParam === 'success') {
    return (
      <div className={pageClass}>
        {showOwnerBack ? <PublicOwnerPreviewBackBar /> : null}
        {brandChrome}
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-600 mb-4" />
          <h1 className="text-xl font-semibold mb-2">Payment received</h1>
          <p className="text-sm text-gray-600 mb-6">Thank you! Your payment for {data?.title || 'this quote'} has been recorded.</p>
          <PublicPdfDownload
            url={data?.pdfDownloadUrl}
            fileName={`${data?.title || 'Quote'}.pdf`}
            className="pb-0"
          />
        </div>
      </div>
    )
  }

  return (
    <div className={pageClass}>
      {showOwnerBack ? <PublicOwnerPreviewBackBar /> : null}
      {brandChrome}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">
        {isPreview && (
          <div
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
            role="status"
          >
            Preview only — this is how your client will see the quote. Buttons are shown for reference but cannot be used here.
          </div>
        )}
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{data.title || 'Quote'}</h1>
          {data.recipientEmail && (
            <p className="text-sm text-gray-500 mt-1">Prepared for {data.clientName || data.recipientEmail}</p>
          )}
          {data.message && (
            <p className="mt-3 text-sm text-gray-700 bg-white rounded-lg p-3 border border-gray-200 whitespace-pre-wrap">{data.message}</p>
          )}
        </header>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                {canRespond && optionalIds.size > 0 && <th className="w-10 px-2 py-2" />}
                <th className="px-4 py-2 font-medium">Service</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(data.lineItems || []).map((item) => {
                const isOptional = optionalIds.has(item.id)
                const included = !isOptional || selectedOptionalIds.includes(item.id) || !canRespond
                const showCheckbox = canRespond && isOptional
                return (
                  <tr key={item.id} className={cn('border-t border-gray-100', !included && canRespond && 'opacity-50')}>
                    {canRespond && optionalIds.size > 0 && (
                      <td className="px-2 py-3 align-middle">
                        {showCheckbox ? (
                          <QuoteCheckToggle
                            variant="public"
                            iconOnly
                            checked={selectedOptionalIds.includes(item.id)}
                            onChange={() => toggleOptional(item.id)}
                            aria-label={`Include ${item.name || 'add-on'}`}
                          />
                        ) : null}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {item.name}
                        {isOptional && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600 font-semibold">Add-on</span>
                        )}
                      </div>
                      {item.description && <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>}
                      {item.quantity > 1 && item.unitPrice != null && (
                      <div className="text-xs text-gray-400">Qty {item.quantity} × {formatQuoteMoney(item.unitPrice)}</div>
                    )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {included
                        ? (item.amount != null ? formatQuoteMoney(item.amount) : 'Included')
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={canRespond && optionalIds.size > 0 ? 2 : 1} className="px-4 py-2 text-gray-600">Subtotal</td>
                <td className="px-4 py-2 text-right">{formatQuoteMoney(liveTotals?.subtotal ?? data.subtotal)}</td>
              </tr>
              {(liveTotals?.taxAmount ?? data.taxAmount) > 0 && (
                <tr>
                  <td colSpan={canRespond && optionalIds.size > 0 ? 2 : 1} className="px-4 py-2 text-gray-600">Tax</td>
                  <td className="px-4 py-2 text-right">{formatQuoteMoney(liveTotals?.taxAmount ?? data.taxAmount)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={canRespond && optionalIds.size > 0 ? 2 : 1} className="px-4 py-3 font-semibold text-gray-900">Total</td>
                <td className="px-4 py-3 text-right font-bold text-lg">{formatQuoteMoney(displayTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {canRespond && optionalIds.size > 0 && (
          <p className="text-xs text-gray-500 mb-4 -mt-4">Check optional add-ons to include them in your total before accepting.</p>
        )}

        {data.validUntil && (
          <p className="text-xs text-gray-500 mb-4">Valid until {data.validUntil.slice(0, 10)}</p>
        )}

        {data.terms?.trim() && (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-2">Terms</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.terms.trim()}</p>
          </div>
        )}

        <GoogleReviewsBlock googleReviews={branding?.googleReviews} className="mb-6" />

        <PublicPdfDownload
          url={data.pdfDownloadUrl}
          fileName={`${data.title || 'Quote'}.pdf`}
        />

        {data.clientResponse && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm">
            <p className="font-medium capitalize">You {data.clientResponse.action?.replace('_', ' ')}</p>
            {data.clientResponse.message && <p className="mt-1 text-gray-700">{data.clientResponse.message}</p>}
            {data.clientResponse.selectedOptionalIds?.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">Selected add-ons: {data.clientResponse.selectedOptionalIds.length}</p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {isRespondableStatus && (
          <div className="space-y-3 mb-6">
            <textarea
              className={cn(
                'w-full min-h-[80px] border border-gray-300 rounded-lg px-3 py-2 text-sm',
                isPreview && 'bg-gray-50 text-gray-500 cursor-not-allowed'
              )}
              placeholder="Optional message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              readOnly={isPreview}
              tabIndex={isPreview ? -1 : undefined}
            />
            {canRespond && (
              <LegalConsentCheckbox
                id="public-quote-legal-consent"
                variant="quote"
                checked={legalAccepted}
                onChange={setLegalAccepted}
                disabled={submitting || isPreview}
                className="mb-1"
              />
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className={cn('relative', isPreview && 'pointer-events-none')}>
                <button
                  type="button"
                  disabled={submitting || !legalAccepted}
                  className="w-full py-3 px-4 rounded-lg bg-green-600 text-white font-medium text-sm hover:bg-green-700 disabled:opacity-50"
                  onClick={() => handleRespond('accept')}
                >
                  Accept {formatQuoteMoney(displayTotal)}
                </button>
                {isPreview && (
                  <span className="absolute inset-0 rounded-lg bg-gray-500/45 pointer-events-none" aria-hidden />
                )}
              </div>
              <div className={cn('relative', isPreview && 'pointer-events-none')}>
                <button
                  type="button"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-lg bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 disabled:opacity-50"
                  onClick={() => handleRespond('request_change')}
                >
                  Request changes
                </button>
                {isPreview && (
                  <span className="absolute inset-0 rounded-lg bg-gray-500/45 pointer-events-none" aria-hidden />
                )}
              </div>
              <div className={cn('relative', isPreview && 'pointer-events-none')}>
                <button
                  type="button"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-lg bg-gray-200 text-gray-800 font-medium text-sm hover:bg-gray-300 disabled:opacity-50"
                  onClick={() => handleRespond('decline')}
                >
                  Decline
                </button>
                {isPreview && (
                  <span className="absolute inset-0 rounded-lg bg-gray-500/45 pointer-events-none" aria-hidden />
                )}
              </div>
            </div>
          </div>
        )}

        {showPayButton && (
          <div className={cn('relative', isPreview && 'pointer-events-none')}>
            <button
              type="button"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
              onClick={handlePay}
            >
              <CreditCard className="h-5 w-5" />
              Pay {formatQuoteMoney(data.total ?? displayTotal)}
            </button>
            {isPreview && (
              <span className="absolute inset-0 rounded-lg bg-gray-500/45 pointer-events-none" aria-hidden />
            )}
          </div>
        )}

        {data.status === 'accepted' && data.paymentEnabled && !data.stripeConfigured && (
          <p className="text-sm text-gray-500 text-center mt-4">Contact the sender to complete payment.</p>
        )}

        <LegalFooterLinks className="mt-8 pb-6" />
      </div>
    </div>
  )
}
