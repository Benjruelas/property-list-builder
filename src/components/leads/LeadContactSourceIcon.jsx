import { ScanSearch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isSkipTracedLeadContact } from '@/utils/leadContact'

export function LeadContactSourceIcon({ detail, className }) {
  if (!isSkipTracedLeadContact(detail)) return null
  return (
    <ScanSearch
      className={cn('lead-contact-source-icon shrink-0', className)}
      aria-label="Skip traced"
      title="Skip traced"
    />
  )
}
