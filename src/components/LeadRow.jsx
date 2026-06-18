import { Phone, Mail, Briefcase } from 'lucide-react'
import {
  displayLeadName,
  formatLeadAddress,
  getLeadStatus,
  getLeadStatusMeta,
  lastContactedAt,
  formatLastContacted,
} from '@/utils/leads'
import { LeadSharingIcon } from './ResourceSharePicker'
import { EntityTagPills } from './tags/EntityTagPills'
import { CrmPhoneCell, CrmEmailCell } from './crm/CrmTableCells'
import { cn } from '@/lib/utils'
import { formatPhoneDisplay } from '@/utils/phoneFormat'

export const LEAD_LIST_ROW_CLASS =
  'map-panel-list-item leads-panel-list-item crm-lead-row flex flex-col px-3.5 py-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer'

function LeadStatusBadge({ statusMeta, className }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 text-[10px] px-2 py-0.5 rounded-md border uppercase tracking-wide font-medium',
        statusMeta.color,
        className
      )}
    >
      {statusMeta.label}
    </span>
  )
}

export function LeadRow({ lead, dealCount = 0, onClick, className, tagRegistry }) {
  const name = displayLeadName(lead)
  const address = formatLeadAddress(lead) || 'No address'
  const statusId = getLeadStatus(lead, dealCount)
  const statusMeta = getLeadStatusMeta(statusId)
  const lastContact = formatLastContacted(lastContactedAt(lead))
  const hasContact = !!(lead.phone || lead.email)

  return (
    <div
      className={cn(LEAD_LIST_ROW_CLASS, className)}
      onMouseDown={(e) => {
        if (e.button === 0) e.preventDefault()
      }}
      onClick={() => onClick?.(lead)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(lead)}
    >
      {/* Mobile — compact card */}
      <div className="crm-lead-mobile md:hidden flex flex-col gap-2 min-w-0">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="text-[15px] font-semibold leading-snug truncate">{name}</div>
              <LeadSharingIcon resource={lead} />
            </div>
            <div className="text-xs text-white/55 truncate mt-0.5" title={lead.address || undefined}>
              {address}
            </div>
          </div>
          <LeadStatusBadge statusMeta={statusMeta} />
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/50 min-w-0">
          {lead.phone && (
            <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
              <Phone className="h-3 w-3 shrink-0 opacity-60" />
              <span className="truncate">{formatPhoneDisplay(lead.phone)}</span>
            </span>
          )}
          {lead.email && (
            <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
              <Mail className="h-3 w-3 shrink-0 opacity-60" />
              <span className="truncate">{lead.email}</span>
            </span>
          )}
          {!hasContact && (
            <span className="text-white/35">No contact info</span>
          )}
        </div>

        <EntityTagPills entity={lead} tagRegistry={tagRegistry} type="leads" />

        <div className="flex items-center justify-between gap-2 text-[11px] text-white/42 pt-1.5 border-t border-white/[0.08]">
          <span className="truncate">{lastContact || 'Never contacted'}</span>
          {dealCount > 0 && (
            <span className="inline-flex items-center gap-1 shrink-0 text-white/50">
              <Briefcase className="h-3 w-3 opacity-60" />
              {dealCount} deal{dealCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Desktop — table columns */}
      <div className="hidden md:contents">
        <div className="crm-col-lead min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="panel-item-title truncate">{name}</div>
            <LeadSharingIcon resource={lead} />
          </div>
        </div>

        <div className="crm-col-tags min-w-0">
          <EntityTagPills entity={lead} tagRegistry={tagRegistry} type="leads" />
        </div>

        <div className="crm-col-status min-w-0">
          <LeadStatusBadge statusMeta={statusMeta} />
        </div>

        <div className="crm-col-property min-w-0 truncate panel-item-body opacity-60" title={lead.address || undefined}>
          {address}
        </div>

        <CrmPhoneCell phone={lead.phone} />
        <CrmEmailCell email={lead.email} />

        <div className="crm-col-meta min-w-0 space-y-0.5">
          {lastContact ? (
            <div>{lastContact}</div>
          ) : (
            <div className="opacity-40">Never contacted</div>
          )}
          {dealCount > 0 && (
            <div className="inline-flex items-center gap-1">
              <Briefcase className="h-3 w-3 shrink-0 opacity-60" />
              {dealCount} deal{dealCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
