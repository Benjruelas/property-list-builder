import { LEGAL_SITE_URL } from '../../legal/legalMeta'

/** Compact Terms · Privacy footer for public and auth surfaces. */
export function LegalFooterLinks({ className = '', openInNewTab = false }) {
  const linkProps = openInNewTab
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {}

  return (
    <nav
      className={`legal-footer-links flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-gray-500 ${className}`}
      aria-label="Legal"
    >
      <a href="/terms" className="hover:text-blue-700 hover:underline" {...linkProps}>
        Terms
      </a>
      <span className="text-gray-300" aria-hidden>
        ·
      </span>
      <a href="/privacy" className="hover:text-blue-700 hover:underline" {...linkProps}>
        Privacy
      </a>
      <span className="sr-only">{LEGAL_SITE_URL}</span>
    </nav>
  )
}

export default LegalFooterLinks
