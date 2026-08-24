/** Versioned legal document metadata — bump LEGAL_VERSION when TOS/Privacy text changes. */

export const LEGAL_SITE_URL = 'https://knockscout.app'
export const LEGAL_CONTACT_EMAIL = 'privacy@knockscout.com'
export const LEGAL_OPERATOR = 'KnockScout, the operator of knockscout.app'
export const LEGAL_EFFECTIVE_DATE = 'August 22, 2026'
export const LEGAL_VERSION = '2026-08-22'

export function buildLegalConsentPayload() {
  return {
    acceptedAt: new Date().toISOString(),
    version: LEGAL_VERSION,
  }
}
