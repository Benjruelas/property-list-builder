import { cn } from '@/lib/utils'
import { formatPhoneDisplay } from '@/utils/phoneFormat'
import { getLeadPhones, getLeadEmails } from '@/utils/leadContact'

export function CrmEmptyCell({ className }) {
  return <span className={cn('crm-cell-empty', className)}>—</span>
}

function ContactMoreBadge({ count }) {
  if (count < 1) return null
  return <span className="crm-contact-more-badge shrink-0">+{count}</span>
}

export function CrmPhoneCell({ phone, phones: phonesProp, className }) {
  const list = phonesProp?.length
    ? phonesProp
    : (phone ? [phone] : [])
  const display = list.map((p) => formatPhoneDisplay(p)).filter(Boolean)
  return (
    <div className={cn('crm-col-phone crm-col-contact-field min-w-0', className)}>
      {display.length ? (
        <span className="flex items-center gap-1 min-w-0" title={display.join('\n')}>
          <span className="truncate">{display[0]}</span>
          <ContactMoreBadge count={display.length - 1} />
        </span>
      ) : (
        <CrmEmptyCell />
      )}
    </div>
  )
}

export function CrmEmailCell({ email, emails: emailsProp, className }) {
  const list = emailsProp?.length
    ? emailsProp
    : (email ? [email] : [])
  return (
    <div className={cn('crm-col-email crm-col-contact-field min-w-0', className)}>
      {list.length ? (
        <span className="flex items-center gap-1 min-w-0" title={list.join('\n')}>
          <span className="truncate">{list[0]}</span>
          <ContactMoreBadge count={list.length - 1} />
        </span>
      ) : (
        <CrmEmptyCell />
      )}
    </div>
  )
}

export function crmPhonesFromLead(lead) {
  return getLeadPhones(lead)
}

export function crmEmailsFromLead(lead) {
  return getLeadEmails(lead)
}
