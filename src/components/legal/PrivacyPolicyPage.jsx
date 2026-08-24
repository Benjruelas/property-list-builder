import { LegalPage } from './LegalPage'
import { PRIVACY_SECTIONS, PRIVACY_TITLE } from '../../legal/privacyContent'

export function PrivacyPolicyPage() {
  return <LegalPage title={PRIVACY_TITLE} sections={PRIVACY_SECTIONS} />
}

export default PrivacyPolicyPage
