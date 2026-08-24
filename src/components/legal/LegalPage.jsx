import { PublicFormBrandBar } from '../forms/PublicFormBrand'
import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from '../../legal/legalMeta'
import { cn } from '@/lib/utils'

/**
 * Shared layout for /terms and /privacy.
 */
export function LegalPage({ title, sections }) {
  return (
    <div className="legal-page flex flex-col min-h-[100dvh] bg-gray-50 text-gray-900">
      <PublicFormBrandBar className="public-form-brand-bar--page" />
      <div className="flex-1 overflow-y-auto">
        <div className="legal-page-inner mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
          <header className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
            <p className="mt-2 text-sm text-gray-500">
              Effective date: {LEGAL_EFFECTIVE_DATE}
              <span className="mx-2 text-gray-300" aria-hidden>
                ·
              </span>
              Version {LEGAL_VERSION}
            </p>
            <nav className="legal-toc mt-5 rounded-xl border border-gray-200 bg-white p-4" aria-label="On this page">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">On this page</p>
              <ul className="space-y-1.5">
                {(sections || []).map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-sm text-blue-700 hover:text-blue-900 hover:underline"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </header>

          <article className="legal-prose space-y-8">
            {(sections || []).map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">{section.title}</h2>
                <div className={cn('legal-section-body text-sm leading-relaxed text-gray-700 space-y-3')}>
                  {section.body}
                </div>
              </section>
            ))}
          </article>

          <footer className="mt-12 pt-6 border-t border-gray-200 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-500">
            <a href="/terms" className="text-blue-700 hover:underline">
              Terms of Service
            </a>
            <a href="/privacy" className="text-blue-700 hover:underline">
              Privacy Policy
            </a>
            <a href="/" className="text-blue-700 hover:underline">
              Back to KnockScout
            </a>
          </footer>
        </div>
      </div>
    </div>
  )
}

export default LegalPage
