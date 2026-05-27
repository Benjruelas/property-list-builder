import { Loader2 } from 'lucide-react'
import { PublicFormBrandBar } from './PublicFormBrand'

export function PublicFormSubmittingOverlay() {
  return (
    <div
      className="public-form-submitting-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Submitting form"
    >
      <PublicFormBrandBar className="public-form-brand-bar--overlay" />
      <div className="public-form-submitting-card">
        <Loader2 className="h-9 w-9 mx-auto mb-4 text-blue-600 animate-spin" aria-hidden />
        <h2 className="public-form-submitting-title">Submitting your form</h2>
        <p className="public-form-submitting-text">
          Finalizing your PDF and sending it securely. This may take a few seconds.
        </p>
      </div>
    </div>
  )
}

export default PublicFormSubmittingOverlay
