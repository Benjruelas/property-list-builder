import { cn } from '@/lib/utils'
import { QUOTE_STATUS_LABELS, quoteStatusClass } from '@/utils/quoteMath'

export function QuoteStatusBadge({ status, className }) {
  const label = QUOTE_STATUS_LABELS[status] || status || 'Draft'
  return (
    <span className={cn(quoteStatusClass(status), className)}>
      {label}
    </span>
  )
}
