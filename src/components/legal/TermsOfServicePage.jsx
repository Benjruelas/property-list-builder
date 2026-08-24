import { LegalPage } from './LegalPage'
import { TERMS_SECTIONS, TERMS_TITLE } from '../../legal/termsContent'

export function TermsOfServicePage() {
  return <LegalPage title={TERMS_TITLE} sections={TERMS_SECTIONS} />
}

export default TermsOfServicePage
