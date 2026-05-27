import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { fetchPublicForm } from '../../utils/forms'
import { cn } from '@/lib/utils'
import { PublicFormBrandBar } from './PublicFormBrand'
import { PublicFormSubmittingOverlay } from './PublicFormSubmittingOverlay'

const FormFillView = lazy(() => import('./FormFillView'))

export function PublicFormPage({ token }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [formData, setFormData] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchPublicForm(token)
        if (!cancelled) setFormData(data)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Unable to load form')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [token])

  const template = useMemo(() => {
    if (!formData) return null
    return {
      id: 'public',
      name: formData.templateName || 'Form',
      fields: formData.fields || [],
    }
  }, [formData])

  const prefillValues = useMemo(() => formData?.prefillValues || {}, [formData?.prefillValues])

  const lockedFieldIds = useMemo(() => {
    if (formData?.lockedFieldIds?.length) return formData.lockedFieldIds
    return Object.keys(formData?.prefillValues || {})
  }, [formData?.lockedFieldIds, formData?.prefillValues])

  const pageClass = cn('public-form-page flex flex-col min-h-screen bg-gray-100 text-gray-900')

  if (loading) {
    return (
      <div className={pageClass}>
        <PublicFormBrandBar className="public-form-brand-bar--page" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-gray-600 flex items-center justify-center">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading form…
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={pageClass}>
        <PublicFormBrandBar className="public-form-brand-bar--page" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
          <h1 className="text-lg font-semibold mb-2">Form unavailable</h1>
          <p className="text-sm text-gray-600 max-w-md">{error}</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className={pageClass}>
        <PublicFormBrandBar className="public-form-brand-bar--page" />
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="public-form-status-card">
            <div className="public-form-status-icon" aria-hidden>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="public-form-status-title">Form submitted</h1>
            <p className="public-form-status-text">
              Thank you. Your completed form has been sent securely. This link is no longer active.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('public-form-page flex flex-col h-[100dvh] overflow-hidden bg-white text-gray-900 relative')}>
      {submitting && <PublicFormSubmittingOverlay />}
      {formData?.message && (
        <div className="shrink-0 px-4 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-900">
          {formData.message}
        </div>
      )}
      {formData?.recipientEmail && (
        <div className="shrink-0 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
          This form was sent to {formData.recipientEmail}
        </div>
      )}
      <div className="flex flex-1 min-h-0 flex flex-col">
        <Suspense fallback={
          <div className="flex flex-1 flex-col">
            <PublicFormBrandBar className="public-form-brand-bar--page" />
            <div className="flex flex-1 items-center justify-center text-sm text-gray-600">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading form…
            </div>
          </div>
        }>
          <FormFillView
            mode="public"
            publicToken={token}
            template={template}
            initialValues={prefillValues}
            lockedFieldIds={lockedFieldIds}
            onSubmittingChange={setSubmitting}
            onSubmitted={() => setSubmitted(true)}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default PublicFormPage
