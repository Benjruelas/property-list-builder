import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_OPERATOR,
  LEGAL_SITE_URL,
} from './legalMeta'

export const PRIVACY_TITLE = 'Privacy Policy'

export const PRIVACY_SECTIONS = [
  {
    id: 'who',
    title: '1. Who We Are',
    body: (
      <>
        <p>
          This Privacy Policy explains how {LEGAL_OPERATOR} (“KnockScout,” “we,” “us,” or “our”)
          collects, uses, and shares information when you use{' '}
          <a href={LEGAL_SITE_URL}>{LEGAL_SITE_URL}</a> and related apps and services (the “Service”).
        </p>
        <p>This Policy covers two audiences:</p>
        <ul>
          <li>
            <strong>KnockScout users</strong> — people who create accounts (for example, field sales
            reps, contractors, and real-estate professionals) and their team members.
          </li>
          <li>
            <strong>Recipients</strong> — homeowners, clients, or other people who open a public
            form, quote, or photo-report link sent by a KnockScout user, without creating an account.
          </li>
        </ul>
        <p>
          When a KnockScout user sends you a form or quote, that user is typically the business you
          are dealing with. KnockScout provides the technology that hosts the link, stores the
          submission, and delivers completed documents.
        </p>
      </>
    ),
  },
  {
    id: 'collect',
    title: '2. Information We Collect',
    body: (
      <>
        <h3>Account and profile</h3>
        <p>
          When you sign up, we collect email address, password (stored by our authentication
          provider), optional display name, and similar profile or company branding settings you
          choose to save.
        </p>
        <h3>CRM and lead data (KnockScout users)</h3>
        <p>
          Users may store names, phone numbers, email addresses, mailing and property addresses,
          notes, custom fields, tags, deal information, activity history, and related business
          records about property owners and clients.
        </p>
        <h3>Location, camera, and device</h3>
        <p>
          With your permission, the Service may access device location (for map position, GPS path
          recording, and photo geotags) and the camera or photo library (for field photos). We also
          process approximate technical data such as IP address for security and rate limiting.
        </p>
        <h3>Maps, parcels, and skip tracing</h3>
        <p>
          We process map search queries, coordinates, and parcel identifiers. When users run skip
          tracing, we send structured address (and sometimes owner name) information to third-party
          data providers and may store returned phone numbers and emails on the lead or parcel
          record.
        </p>
        <h3>Forms, quotes, and reports (including recipients)</h3>
        <p>
          For public forms we may process recipient email or phone (from the invite), form field
          values, signatures, completed PDF files, and a record that you accepted our terms version
          when submitting. For quotes we may process your response (accept, decline, or request
          changes), optional message, selected add-ons, and payment status. Photo reports may display
          limited lead name and address and property photos to anyone with the link.
        </p>
        <h3>Local device storage</h3>
        <p>
          We use browser local storage, session storage, and IndexedDB for authentication session,
          offline queues, preferences, and caches. We do not use third-party advertising cookies or
          marketing pixels in the Service today.
        </p>
        <h3>Support and diagnostics</h3>
        <p>
          If error monitoring is enabled, we may receive technical error reports (and optional
          performance traces) through our monitoring provider.
        </p>
      </>
    ),
  },
  {
    id: 'use',
    title: '3. How We Use Information',
    body: (
      <>
        <p>We use information to:</p>
        <ul>
          <li>Provide, operate, secure, and improve the Service</li>
          <li>Authenticate users and manage teams and sharing</li>
          <li>Deliver forms, quotes, reports, and transactional emails</li>
          <li>Process quote payments through our payment provider</li>
          <li>Enforce rate limits, prevent abuse, and troubleshoot issues</li>
          <li>Comply with law and respond to lawful requests</li>
          <li>Communicate about the Service (for example, password resets and product notices)</li>
        </ul>
        <p>
          We do not sell personal information for money. We do not use personal information for
          cross-context behavioral advertising in the Service as currently built.
        </p>
      </>
    ),
  },
  {
    id: 'skip-trace',
    title: '4. Skip Tracing and Property-Owner Data',
    body: (
      <>
        <p>
          KnockScout users may enrich property records with contact information from public records
          and commercial data providers. That processing is initiated by the user for their
          canvassing or sales purposes. If you are a property owner whose information appears in a
          user’s account, that user may be the primary controller of that CRM record. You may still
          contact us at {' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
          {' '}and we will help facilitate appropriate requests where we can.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: '5. How We Share Information',
    body: (
      <>
        <p>We share information with:</p>
        <ul>
          <li>
            <strong>Service providers</strong> who process data on our behalf, including hosting
            (Vercel), databases (Vercel KV / Redis), file storage (Cloudflare R2), authentication
            (Firebase / Google), email delivery (Resend), payments (Stripe), maps and geocoding
            (Google Map Tiles, Mapbox), parcel data (LandRecords), skip-trace providers (such as
            Trestle, and optionally other providers we configure), imagery providers (such as Google
            Solar, Copernicus Sentinel Hub, EagleView), and optional error monitoring (Sentry).
          </li>
          <li>
            <strong>The KnockScout user who sent you a link</strong>, when you submit a form or
            respond to a quote — including completed PDFs and response details.
          </li>
          <li>
            <strong>Team members and collaborators</strong> that a user invites or shares resources
            with, according to their sharing settings.
          </li>
          <li>
            <strong>Legal and safety</strong> disclosures when required by law or to protect rights,
            safety, and the integrity of the Service.
          </li>
        </ul>
        <p>
          SMS: when a user chooses to text a link, KnockScout typically opens the user’s device SMS
          app. Message content and carrier delivery are outside our SMS infrastructure.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: '6. Cookies and Similar Technologies',
    body: (
      <>
        <p>
          We use essential technologies to keep you signed in, remember preferences, support offline
          use, and load maps. We do not currently run third-party advertising cookies. Your browser
          or device settings may allow you to clear stored data; doing so may sign you out or reset
          local caches.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    title: '7. Retention',
    body: (
      <>
        <p>
          Public form, quote, and report invite links are generally valid for about 30 days, and
          inactive invite records may be pruned after about 90 days. Account CRM data, photos, and
          files are retained until the account holder deletes them or requests deletion, subject to
          backups and legal retention needs. Some technical caches (for example, imagery) expire on
          shorter schedules.
        </p>
      </>
    ),
  },
  {
    id: 'rights',
    title: '8. Your Rights and Choices',
    body: (
      <>
        <p>
          Depending on where you live (including under California and similar U.S. state privacy
          laws), you may have rights to request access to, correction of, or deletion of personal
          information, and to appeal certain decisions. To make a request, email{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
          We may need to verify your identity and the nature of your relationship to the data (for
          example, account holder vs. form recipient).
        </p>
        <p>
          Account holders can update much of their profile and CRM data in the app. Recipients who
          received a form or quote from a business should also contact that business for requests
          about the underlying customer relationship.
        </p>
        <p>
          You can deny location or camera permissions in your device or browser settings; some
          features will not work without them.
        </p>
      </>
    ),
  },
  {
    id: 'ccpa',
    title: '9. Categories of Personal Information (U.S. State Notices)',
    body: (
      <>
        <p>In the prior 12 months, depending on how the Service is used, categories may include:</p>
        <ul>
          <li>Identifiers (name, email, phone, IP address, account ID)</li>
          <li>Commercial information (quotes, deal records, payment status)</li>
          <li>Internet or electronic activity (app usage, invite views)</li>
          <li>Geolocation data (GPS paths, photo coordinates, map context)</li>
          <li>Visual information (property and field photos, signatures)</li>
          <li>Professional or employment-related information (company branding, team roles)</li>
          <li>Inferences drawn from the above for CRM workflow (for example, lead status)</li>
        </ul>
        <p>
          Sources include you directly, KnockScout users who import or enter lead data, device
          sensors, and third-party map/parcel/skip-trace providers. Business purposes are described
          in Sections 3 and 5. We do not “sell” or “share” personal information as those terms are
          commonly defined for targeted advertising in the current product.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: '10. Children’s Privacy',
    body: (
      <>
        <p>
          The Service is not directed to children under 18, and we do not knowingly collect personal
          information from children. If you believe a child has provided us information, contact us
          and we will take appropriate steps.
        </p>
      </>
    ),
  },
  {
    id: 'international',
    title: '11. International Users',
    body: (
      <>
        <p>
          The Service is operated from the United States. If you access it from elsewhere, your
          information may be processed in the U.S. and other countries where our providers operate,
          which may have different data-protection rules than your country.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: '12. Changes to This Policy',
    body: (
      <>
        <p>
          We may update this Privacy Policy from time to time. The effective date and version on this
          page will change when we do. Continued use of the Service after an update means you
          acknowledge the revised Policy.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '13. Contact',
    body: (
      <>
        <p>
          Privacy requests and questions:{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
        </p>
        <p>
          Operator: {LEGAL_OPERATOR}. Website: {' '}
          <a href={LEGAL_SITE_URL}>{LEGAL_SITE_URL}</a>.
        </p>
        <p className="legal-meta-note">Effective date: {LEGAL_EFFECTIVE_DATE}.</p>
      </>
    ),
  },
]
