import { cn } from '@/lib/utils'

const LINK_PROPS = { target: '_blank', rel: 'noopener noreferrer' }

function TermsLink() {
  return (
    <a href="/terms" {...LINK_PROPS}>
      Terms of Service
    </a>
  )
}

function PrivacyLink({ label = 'Privacy Policy' }) {
  return (
    <a href="/privacy" {...LINK_PROPS}>
      {label}
    </a>
  )
}

function ConsentCopy({ variant }) {
  if (variant === 'form') {
    return (
      <>
        I agree to submit this form electronically. If I signed, my signature is an electronic
        signature under applicable law. My responses go to the sender who shared this link;
        KnockScout processes delivery as described in the <TermsLink /> and <PrivacyLink />.
      </>
    )
  }
  if (variant === 'quote') {
    return (
      <>
        I accept this quote and the sender&apos;s terms above. My agreement is with the sender, not
        KnockScout. See KnockScout&apos;s <PrivacyLink /> for how we process this response.
      </>
    )
  }
  // signup (default)
  return (
    <>
      I agree to the <TermsLink /> and <PrivacyLink />.
    </>
  )
}

/**
 * Required legal acceptance checkbox for form submit, signup, and quote accept.
 * @param {'form'|'signup'|'quote'} variant
 */
export function LegalConsentCheckbox({
  id = 'legal-consent',
  variant = 'signup',
  checked,
  onChange,
  disabled = false,
  className,
}) {
  return (
    <div className={cn('legal-consent', className)}>
      <input
        id={id}
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        aria-required="true"
      />
      <label htmlFor={id} className="legal-consent-label">
        <ConsentCopy variant={variant} />
      </label>
    </div>
  )
}

export default LegalConsentCheckbox
