import { cn } from '@/lib/utils'

/**
 * Team logo + business name + quote creator contact.
 * `variant`: public (client quote page) | panel (in-app quote details).
 */
export function QuoteBrandHeader({
  businessName,
  logoBase64,
  senderName,
  senderEmail,
  variant = 'public',
  className,
}) {
  const name = (senderName || '').trim()
  const email = (senderEmail || '').trim()
  const company = (businessName || '').trim()

  if (!company && !logoBase64 && !name && !email) return null

  return (
    <header
      className={cn(
        'quote-brand-header',
        variant === 'panel' && 'quote-brand-header--panel',
        className
      )}
    >
      <div className="quote-brand-header__main">
        {logoBase64 ? (
          <img
            src={logoBase64}
            alt=""
            className="quote-brand-header__logo"
          />
        ) : null}
        <div className="quote-brand-header__copy">
          {company ? <div className="quote-brand-header__company">{company}</div> : null}
          {(name || email) ? (
            <div className="quote-brand-header__contact">
              {name ? <span className="quote-brand-header__sender">{name}</span> : null}
              {name && email ? <span className="quote-brand-header__contact-sep" aria-hidden>·</span> : null}
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="quote-brand-header__email"
                >
                  {email}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
