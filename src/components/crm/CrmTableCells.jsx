import { cn } from '@/lib/utils'
import { formatPhoneDisplay } from '@/utils/phoneFormat'

export function CrmEmptyCell({ className }) {
  return <span className={cn('crm-cell-empty', className)}>—</span>
}

export function CrmPhoneCell({ phone, className }) {
  const display = formatPhoneDisplay(phone)
  return (
    <div className={cn('crm-col-phone crm-col-contact-field min-w-0', className)}>
      {display ? (
        <span className="block truncate" title={display}>
          {display}
        </span>
      ) : (
        <CrmEmptyCell />
      )}
    </div>
  )
}

export function CrmEmailCell({ email, className }) {
  return (
    <div className={cn('crm-col-email crm-col-contact-field min-w-0', className)}>
      {email ? (
        <span className="block truncate" title={email}>
          {email}
        </span>
      ) : (
        <CrmEmptyCell />
      )}
    </div>
  )
}
