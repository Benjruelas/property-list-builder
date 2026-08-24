import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_OPERATOR,
  LEGAL_SITE_URL,
} from './legalMeta'

export const TERMS_TITLE = 'Terms of Service'

export const TERMS_SECTIONS = [
  {
    id: 'acceptance',
    title: '1. Acceptance of These Terms',
    body: (
      <>
        <p>
          These Terms of Service (“Terms”) govern your access to and use of the KnockScout
          application, websites, and related services available at{' '}
          <a href={LEGAL_SITE_URL}>{LEGAL_SITE_URL}</a> (collectively, the “Service”). The Service
          is provided by {LEGAL_OPERATOR} (“KnockScout,” “we,” “us,” or “our”).
        </p>
        <p>
          By creating an account, accessing the Service, or using a public link we host (including
          forms, quotes, or reports), you agree to these Terms. If you do not agree, do not use the
          Service.
        </p>
        <p>
          If you use the Service on behalf of a company or other organization, you represent that
          you have authority to bind that organization, and “you” includes that organization.
        </p>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: '2. Eligibility',
    body: (
      <>
        <p>
          You must be at least 18 years old and able to form a binding contract to use KnockScout
          as an account holder. The Service is intended for lawful business and professional use
          (for example, field sales, contracting, and real-estate canvassing), not for children.
        </p>
      </>
    ),
  },
  {
    id: 'service',
    title: '3. Description of the Service',
    body: (
      <>
        <p>
          KnockScout is a field canvassing and property-intelligence platform. Features may include
          interactive parcel maps, property lists, lead and deal management, GPS path tracking,
          photo capture and reports, roof and imagery tools, PDF forms, quotes (including optional
          payment checkout), team collaboration, and related outreach tools.
        </p>
        <p>
          We may change, suspend, or discontinue features at any time. We do not guarantee that any
          particular feature will remain available indefinitely.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: '4. Accounts, Teams, and Security',
    body: (
      <>
        <p>
          You are responsible for the accuracy of information you provide, for maintaining the
          confidentiality of your login credentials, and for all activity under your account. Notify
          us promptly if you suspect unauthorized access.
        </p>
        <p>
          Team owners and admins control invites, roles, and certain shared data. You are responsible
          for the people you invite and for configuring team access appropriately.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: '5. Acceptable Use',
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>Violate any law, regulation, or third-party right</li>
          <li>Use the Service to harass, defraud, or spam anyone</li>
          <li>Attempt to gain unauthorized access to systems, accounts, or data</li>
          <li>Scrape, reverse engineer, or overload the Service except as allowed by law</li>
          <li>Resell, sublicense, or redistribute KnockScout data or APIs without our written consent</li>
          <li>Upload malware or content that is illegal, infringing, or harmful</li>
          <li>Misrepresent your identity or affiliation when contacting property owners or clients</li>
        </ul>
        <p>
          We may suspend or terminate accounts that we reasonably believe violate these Terms.
        </p>
      </>
    ),
  },
  {
    id: 'customer-content',
    title: '6. Customer Content and Recipient Documents',
    body: (
      <>
        <p>
          You (and your team) retain ownership of content you upload or create in the Service,
          including leads, notes, photos, form templates, quotes, and messages (“Customer Content”).
        </p>
        <p>
          When you send a form, quote, or report to a recipient, you are solely responsible for:
        </p>
        <ul>
          <li>The accuracy and legality of the document and any terms you include</li>
          <li>Having a lawful basis to contact the recipient</li>
          <li>Your contractual relationship with that recipient</li>
        </ul>
        <p>
          <strong>KnockScout is a technology platform.</strong> We host links, store submissions,
          deliver completed documents, and may facilitate payment checkout. We are not a party to
          any contract between you and a homeowner, client, or other recipient, and we do not
          endorse or guarantee the work, pricing, or promises in your Customer Content.
        </p>
        <p>
          Recipients who complete a form or accept a quote acknowledge that their responses and
          signatures (if any) are provided to the sender who initiated the link, and that KnockScout
          processes that submission on the sender’s behalf as described in our Privacy Policy.
        </p>
        <p>
          You grant KnockScout a limited license to host, process, transmit, and display Customer
          Content solely to operate and improve the Service.
        </p>
      </>
    ),
  },
  {
    id: 'esign',
    title: '7. Electronic Signatures and Records',
    body: (
      <>
        <p>
          The Service may allow electronic signatures and electronic submission of documents. By
          signing or submitting a document through KnockScout, you consent to conduct that
          transaction electronically and agree that your electronic signature and records may have
          the same legal effect as a handwritten signature and paper records, to the extent permitted
          by the U.S. Electronic Signatures in Global and National Commerce Act (ESIGN), the Uniform
          Electronic Transactions Act (UETA), and similar laws.
        </p>
        <p>
          You are responsible for ensuring that electronic signature is appropriate for your
          document and jurisdiction. KnockScout does not provide legal advice.
        </p>
      </>
    ),
  },
  {
    id: 'communications',
    title: '8. Communications and Outreach',
    body: (
      <>
        <p>
          Account holders may send transactional or outreach emails through the Service and may
          open their device’s native SMS composer with a prefilled message. KnockScout does not
          operate a carrier SMS gateway; message delivery outside our email provider is your
          responsibility.
        </p>
        <p>
          You must comply with all applicable telemarketing, anti-spam, and privacy laws, including
          the Telephone Consumer Protection Act (TCPA), CAN-SPAM, and similar state laws. You are
          solely responsible for obtaining any required consents before contacting phone numbers or
          email addresses stored in your account.
        </p>
      </>
    ),
  },
  {
    id: 'skip-trace',
    title: '9. Skip Tracing and Public-Records Data',
    body: (
      <>
        <p>
          The Service may help you look up parcel and property-owner information from public records
          and third-party data providers (skip tracing). You agree to use that information only for
          lawful purposes consistent with your relationship to the property or lead, and not for
          illegal discrimination, stalking, identity theft, or unauthorized resale of consumer data.
        </p>
        <p>
          Third-party data may be incomplete or inaccurate. KnockScout does not warrant the
          correctness of parcel, owner, phone, or email data from any provider.
        </p>
      </>
    ),
  },
  {
    id: 'payments',
    title: '10. Payments',
    body: (
      <>
        <p>
          If a sender enables payment on a quote, checkout is processed by Stripe. Card details are
          handled by Stripe, not stored by KnockScout. Payment is for the goods or services described
          by the sender. Unless we expressly state otherwise, KnockScout is not the merchant of
          record for that transaction and is not responsible for refunds, chargebacks, or fulfillment
          of the sender’s work.
        </p>
      </>
    ),
  },
  {
    id: 'ip',
    title: '11. Intellectual Property',
    body: (
      <>
        <p>
          KnockScout and its logos, software, and design are owned by us or our licensors. These Terms
          do not grant you any right to use our trademarks except as needed to identify the Service
          in good faith.
        </p>
      </>
    ),
  },
  {
    id: 'disclaimers',
    title: '12. Disclaimers',
    body: (
      <>
        <p>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW,
          WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
          UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS, OR THAT MAPS, PARCEL DATA, SKIP
          TRACE RESULTS, OR OTHER INFORMATION WILL BE ACCURATE OR COMPLETE.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    title: '13. Limitation of Liability',
    body: (
      <>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, KNOCKSCOUT AND ITS AFFILIATES, OFFICERS, AND
          SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
          PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR BUSINESS OPPORTUNITY, ARISING OUT OF OR
          RELATED TO THESE TERMS OR THE SERVICE, WHETHER BASED IN CONTRACT, TORT, OR OTHERWISE.
        </p>
        <p>
          OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF THE SERVICE WILL NOT EXCEED THE GREATER
          OF (A) THE AMOUNTS YOU PAID TO KNOCKSCOUT FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE
          CLAIM OR (B) ONE HUNDRED U.S. DOLLARS ($100).
        </p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: '14. Indemnity',
    body: (
      <>
        <p>
          You will defend and indemnify KnockScout against claims, damages, and expenses (including
          reasonable attorneys’ fees) arising from your Customer Content, your use of the Service,
          your outreach or skip-trace activities, or your violation of these Terms or applicable law.
        </p>
      </>
    ),
  },
  {
    id: 'termination',
    title: '15. Termination',
    body: (
      <>
        <p>
          You may stop using the Service at any time. We may suspend or terminate access if you
          breach these Terms or if we discontinue the Service. Provisions that by their nature should
          survive (including ownership, disclaimers, limitation of liability, and indemnity) will
          survive termination.
        </p>
      </>
    ),
  },
  {
    id: 'governing-law',
    title: '16. Governing Law',
    body: (
      <>
        <p>
          These Terms are governed by the laws of the United States and the State of Texas, without
          regard to conflict-of-law rules, except where mandatory consumer protections in your
          jurisdiction apply. Courts located in Texas will have exclusive jurisdiction over disputes
          arising from these Terms, subject to applicable law.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: '17. Changes to These Terms',
    body: (
      <>
        <p>
          We may update these Terms from time to time. The “Effective date” and version identifier
          on this page will change when we do. Continued use of the Service after an update
          constitutes acceptance of the revised Terms. Material changes may also be communicated by
          email or in-product notice when practicable.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: '18. Contact',
    body: (
      <>
        <p>
          Questions about these Terms: {' '}
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
