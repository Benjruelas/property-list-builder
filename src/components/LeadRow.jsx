import { Phone, Mail, Briefcase } from 'lucide-react'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { VisibilityBadge } from './ResourceSharePicker'
import { EntityTagPills } from './tags/EntityTagPills'
import { cn } from '@/lib/utils'

export const LEAD_LIST_ROW_CLASS =
  'map-panel-list-item leads-panel-list-item flex flex-col gap-1 px-3.5 py-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer'

export function LeadRow({ lead, dealCount = 0, onClick, className, tagRegistry }) {
  const name = displayLeadName(lead)
  const address = formatLeadAddress(lead) || 'No address'
  return (
    <div
      className={cn(LEAD_LIST_ROW_CLASS, className)}
      onClick={() => onClick?.(lead)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(lead)}
    >
      <div className="text-sm font-medium truncate">{name}</div>
      <div className="text-xs opacity-60 truncate" title={lead.address || undefined}>{address}</div>
      <div className="flex items-center gap-3 mt-0.5 flex-wrap text-[11px] opacity-50">
        <VisibilityBadge resource={lead} className="normal-case tracking-normal" />
        {lead.phone && (
          <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>
        )}
        {lead.email && (
          <span className="inline-flex items-center gap-1 truncate max-w-[160px]"><Mail className="h-3 w-3" />{lead.email}</span>
        )}
        {dealCount > 0 && (
          <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />{dealCount} deal{dealCount !== 1 ? 's' : ''}</span>
        )}
      </div>
      <EntityTagPills entity={lead} tagRegistry={tagRegistry} type="leads" className="mt-0.5" />
    </div>
  )
}
