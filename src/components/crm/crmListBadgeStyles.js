import { cn } from '@/lib/utils'

/** Shared sizing for status/stage badges and tag pills on Leads & Deals list rows. */
export const CRM_LIST_ROW_BADGE_SIZE =
  'px-2 py-0.5 text-[10px] font-medium leading-[1.25] min-h-[1.125rem]'

export const CRM_LIST_ROW_STATUS_BADGE_CLASS = cn(
  'crm-row-status-badge inline-flex shrink-0 max-w-full items-center rounded-md border uppercase tracking-wide',
  CRM_LIST_ROW_BADGE_SIZE
)
