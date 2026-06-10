import { Clock, Archive } from 'lucide-react'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { formatTimeInState } from '@/utils/dealPipeline'
import { EntityTagPills } from './tags/EntityTagPills'
import { DealProfitBadge } from './DealLineItemsSection'
import { dealHasFinancials } from '@/utils/dealFinances'
import { cn } from '@/lib/utils'

export const DEAL_LIST_ROW_CLASS =
  'map-panel-list-item leads-panel-list-item crm-deal-row flex flex-col px-3.5 py-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer'

function DealStageBadge({ label, closed = false, className, title }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 text-[10px] px-2 py-0.5 rounded-md border uppercase tracking-wide font-medium',
        closed
          ? 'bg-white/10 text-white/70 border-white/20'
          : 'bg-blue-500/20 text-blue-200 border-blue-400/40',
        className
      )}
      title={title || label}
    >
      <span className="truncate">{label}</span>
    </span>
  )
}

function getColumnName(colId, columns) {
  const col = columns?.find((c) => c.id === colId)
  return col?.name || colId
}

function DealAmountCell({ deal, canSeeDealAmounts }) {
  if (!canSeeDealAmounts || !dealHasFinancials(deal)) {
    return <span className="text-xs opacity-40">—</span>
  }
  return <DealProfitBadge deal={deal} className="text-xs" canSeeDealAmounts={canSeeDealAmounts} />
}

export function DealRow({
  deal,
  columns,
  pipelineTitle,
  lead,
  onClick,
  canSeeDealAmounts = true,
  tagRegistry,
  className,
}) {
  const stageName = getColumnName(deal.status, columns)
  const timeStr = formatTimeInState(deal)
  const leadName = lead ? displayLeadName(lead) : (deal.leadName || '')
  const leadAddress = lead ? formatLeadAddress(lead) : (deal.leadAddress || '')
  const hasLead = !!(leadName || leadAddress)

  return (
    <div
      className={cn(DEAL_LIST_ROW_CLASS, className)}
      onMouseDown={(e) => {
        if (e.button === 0) e.preventDefault()
      }}
      onClick={() => onClick?.(deal)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(deal)}
    >
      {/* Mobile — compact card (matches LeadRow) */}
      <div className="crm-deal-mobile md:hidden flex flex-col gap-2 min-w-0">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold leading-snug truncate">
              {deal.title || 'Untitled deal'}
            </div>
            {leadName ? (
              <div className="text-xs text-white/70 truncate mt-0.5">{leadName}</div>
            ) : null}
            {leadAddress ? (
              <div className="text-xs text-white/55 truncate" title={leadAddress}>
                {leadAddress}
              </div>
            ) : null}
            {!hasLead && (
              <div className="text-xs text-white/35 mt-0.5">No lead linked</div>
            )}
          </div>
          <DealStageBadge label={stageName} />
        </div>

        {pipelineTitle && (
          <div className="text-[11px] text-white/50 truncate">{pipelineTitle}</div>
        )}

        <EntityTagPills entity={deal} tagRegistry={tagRegistry} type="deals" />

        <div className="flex items-center justify-between gap-2 text-[11px] text-white/42 pt-1.5 border-t border-white/[0.08]">
          <span className="inline-flex items-center gap-1 truncate">
            {timeStr ? (
              <>
                <Clock className="h-3 w-3 shrink-0 opacity-60" />
                {timeStr}
              </>
            ) : (
              '—'
            )}
          </span>
          <DealProfitBadge deal={deal} canSeeDealAmounts={canSeeDealAmounts} />
        </div>
      </div>

      {/* Desktop — table columns (aligned with LeadRow) */}
      <div className="hidden md:contents">
        <div className="crm-col-deal min-w-0">
          <div className="text-sm font-medium truncate">{deal.title || 'Untitled deal'}</div>
        </div>

        <div className="crm-col-tags min-w-0">
          <EntityTagPills entity={deal} tagRegistry={tagRegistry} type="deals" />
        </div>

        <div className="crm-col-stage min-w-0">
          <DealStageBadge label={stageName} className="max-w-full truncate" title={stageName} />
        </div>

        <div className="crm-col-lead min-w-0">
          {leadName ? (
            <div className="text-sm font-medium truncate">{leadName}</div>
          ) : (
            <span className="text-xs opacity-40">No lead</span>
          )}
        </div>

        <div
          className="crm-col-property min-w-0 truncate text-xs opacity-60"
          title={leadAddress || undefined}
        >
          {leadAddress || '—'}
        </div>

        <div className="crm-col-meta min-w-0">
          {timeStr ? (
            <div className="inline-flex items-center gap-1 truncate">
              <Clock className="h-3 w-3 shrink-0 opacity-60" />
              <span>{timeStr}</span>
            </div>
          ) : (
            <span className="opacity-40">—</span>
          )}
        </div>

        <div className="crm-col-amount min-w-0">
          <DealAmountCell deal={deal} canSeeDealAmounts={canSeeDealAmounts} />
        </div>
      </div>
    </div>
  )
}

export function ClosedDealRow({
  record,
  onClick,
  canSeeDealAmounts = true,
  tagRegistry,
  className,
}) {
  const d = record.deal
  const closedDate = record.closedAt
    ? new Date(record.closedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  const leadName = record.lead ? displayLeadName(record.lead) : (d?.leadName || '')
  const leadAddress = record.lead ? formatLeadAddress(record.lead) : (d?.leadAddress || '')
  const hasLead = !!(leadName || leadAddress)
  const pipelineTitle = record.closedFrom?.title || ''

  return (
    <div
      className={cn(DEAL_LIST_ROW_CLASS, className)}
      onMouseDown={(e) => {
        if (e.button === 0) e.preventDefault()
      }}
      onClick={() => onClick?.(record)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(record)}
    >
      <div className="crm-deal-mobile md:hidden flex flex-col gap-2 min-w-0">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold leading-snug truncate">
              {d?.title || 'Deal'}
            </div>
            {leadName ? (
              <div className="text-xs text-white/70 truncate mt-0.5">{leadName}</div>
            ) : null}
            {leadAddress ? (
              <div className="text-xs text-white/55 truncate" title={leadAddress}>
                {leadAddress}
              </div>
            ) : null}
            {!hasLead && (
              <div className="text-xs text-white/35 mt-0.5">No lead linked</div>
            )}
          </div>
          <DealStageBadge label="Closed" closed />
        </div>

        {pipelineTitle && (
          <div className="text-[11px] text-white/50 truncate">{pipelineTitle}</div>
        )}

        <EntityTagPills entity={d} tagRegistry={tagRegistry} type="deals" />

        <div className="flex items-center justify-between gap-2 text-[11px] text-white/42 pt-1.5 border-t border-white/[0.08]">
          <span className="inline-flex items-center gap-1 truncate">
            {closedDate ? (
              <>
                <Archive className="h-3 w-3 shrink-0 opacity-60" />
                {closedDate}
              </>
            ) : (
              '—'
            )}
          </span>
          <DealProfitBadge deal={d} canSeeDealAmounts={canSeeDealAmounts} />
        </div>
      </div>

      <div className="hidden md:contents">
        <div className="crm-col-deal min-w-0">
          <div className="text-sm font-medium truncate">{d?.title || 'Deal'}</div>
        </div>

        <div className="crm-col-tags min-w-0">
          <EntityTagPills entity={d} tagRegistry={tagRegistry} type="deals" />
        </div>

        <div className="crm-col-stage min-w-0">
          <DealStageBadge label="Closed" closed />
        </div>

        <div className="crm-col-lead min-w-0">
          {leadName ? (
            <div className="text-sm font-medium truncate">{leadName}</div>
          ) : (
            <span className="text-xs opacity-40">No lead</span>
          )}
        </div>

        <div
          className="crm-col-property min-w-0 truncate text-xs opacity-60"
          title={leadAddress || undefined}
        >
          {leadAddress || '—'}
        </div>

        <div className="crm-col-meta min-w-0">
          {closedDate ? (
            <div className="inline-flex items-center gap-1 truncate">
              <Archive className="h-3 w-3 shrink-0 opacity-60" />
              <span>{closedDate}</span>
            </div>
          ) : (
            <span className="opacity-40">—</span>
          )}
        </div>

        <div className="crm-col-amount min-w-0">
          <DealAmountCell deal={d} canSeeDealAmounts={canSeeDealAmounts} />
        </div>
      </div>
    </div>
  )
}
