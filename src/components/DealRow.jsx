import { Clock, Archive, Briefcase, ArrowRight, Trash2 } from 'lucide-react'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { formatTimeInState } from '@/utils/dealPipeline'
import { EntityTagPills } from './tags/EntityTagPills'
import { CrmPhoneCell, CrmEmailCell } from './crm/CrmTableCells'
import { DealProfitBadge } from './DealLineItemsSection'
import { dealHasFinancials } from '@/utils/dealFinances'
import { cn } from '@/lib/utils'

export const DEAL_LIST_ROW_CLASS =
  'map-panel-list-item leads-panel-list-item crm-deal-row flex flex-col px-3.5 py-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer'

export const PIPELINE_DEAL_CARD_CLASS =
  'deal-pipeline-lead-card lead-detail-deal-card map-panel-list-item items-start gap-3 py-3.5 transition-all group'

function resolveDealLead(deal, leads) {
  const lead = deal.leadId && leads?.length ? leads.find((l) => l.id === deal.leadId) : null
  const leadName = lead ? displayLeadName(lead) : (deal.leadName || '')
  const leadAddress = lead ? formatLeadAddress(lead) : (deal.leadAddress || '')
  return { leadName, leadAddress, hasLead: !!(leadName || leadAddress) }
}

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
  return <DealProfitBadge deal={deal} className="panel-item-value" canSeeDealAmounts={canSeeDealAmounts} />
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
          <div className="panel-item-title truncate">{deal.title || 'Untitled deal'}</div>
        </div>

        <div className="crm-col-tags min-w-0">
          <EntityTagPills entity={deal} tagRegistry={tagRegistry} type="deals" />
        </div>

        <div className="crm-col-stage min-w-0">
          <DealStageBadge label={stageName} className="max-w-full truncate" title={stageName} />
        </div>

        <div className="crm-col-lead min-w-0">
          {leadName ? (
            <div className="panel-item-body font-medium truncate">{leadName}</div>
          ) : (
            <span className="panel-item-meta opacity-40">No lead</span>
          )}
        </div>

        <div
          className="crm-col-property min-w-0 truncate panel-item-body opacity-60"
          title={leadAddress || undefined}
        >
          {leadAddress || '—'}
        </div>

        <CrmPhoneCell phone={lead?.phone} />
        <CrmEmailCell email={lead?.email} />

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

export function PipelineDealCard({
  deal,
  leads = [],
  tagRegistry,
  canSeeDealAmounts = true,
  isDragging = false,
  isEditMode = false,
  canCollaborate = false,
  canMoveNext = false,
  onClick,
  onMoveNext,
  onDelete,
  onDragStart,
  onDragEnd,
  draggable = false,
  className,
}) {
  const title = (deal.title || '').trim() || 'Untitled deal'
  const { leadName, leadAddress, hasLead } = resolveDealLead(deal, leads)
  const timeStr = formatTimeInState(deal)
  const hasProfit = canSeeDealAmounts && dealHasFinancials(deal)

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className={cn(
        PIPELINE_DEAL_CARD_CLASS,
        draggable && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-50',
        className,
      )}
    >
      <Briefcase className="h-5 w-5 shrink-0 opacity-50 mt-0.5" aria-hidden />

      <div className="flex-1 min-w-0">
        <div className="panel-item-title truncate leading-snug" title={title}>
          {title}
        </div>
        {leadName ? (
          <div className="panel-item-body text-white/70 truncate mt-0.5" title={leadName}>
            {leadName}
          </div>
        ) : null}
        {leadAddress ? (
          <div className="panel-item-body text-white/55 truncate" title={leadAddress}>
            {leadAddress}
          </div>
        ) : null}
        {!hasLead && (
          <div className="panel-item-body text-white/35 mt-0.5">No lead linked</div>
        )}

        <EntityTagPills entity={deal} tagRegistry={tagRegistry} type="deals" className="mt-1.5" />

        {(timeStr || hasProfit) && (
          <div className="flex items-center justify-between gap-2 panel-item-meta text-white/42 pt-1.5 mt-1.5 border-t border-white/[0.08]">
            <span className="inline-flex items-center gap-1 truncate min-w-0">
              {timeStr ? (
                <>
                  <Clock className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="truncate" title="Time in this stage">{timeStr}</span>
                </>
              ) : (
                <span className="opacity-40">—</span>
              )}
            </span>
            {hasProfit ? (
              <DealProfitBadge deal={deal} className="panel-item-value shrink-0" canSeeDealAmounts={canSeeDealAmounts} />
            ) : null}
          </div>
        )}
      </div>

      <div className="flex shrink-0 self-start pt-0.5">
        {isEditMode ? (
          <button
            type="button"
            className="pipeline-icon-btn p-1 rounded opacity-70 hover:opacity-100 text-red-400 hover:text-red-300"
            onClick={(e) => {
              e.stopPropagation()
              onDelete?.()
            }}
            title="Remove deal"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            className="pipeline-icon-btn p-1 rounded opacity-70 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed text-white/90"
            onClick={(e) => {
              e.stopPropagation()
              onMoveNext?.()
            }}
            title="Move to next stage"
            disabled={!canCollaborate || !canMoveNext}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
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
          <div className="panel-item-title truncate">{d?.title || 'Deal'}</div>
        </div>

        <div className="crm-col-tags min-w-0">
          <EntityTagPills entity={d} tagRegistry={tagRegistry} type="deals" />
        </div>

        <div className="crm-col-stage min-w-0">
          <DealStageBadge label="Closed" closed />
        </div>

        <div className="crm-col-lead min-w-0">
          {leadName ? (
            <div className="panel-item-body font-medium truncate">{leadName}</div>
          ) : (
            <span className="panel-item-meta opacity-40">No lead</span>
          )}
        </div>

        <div
          className="crm-col-property min-w-0 truncate panel-item-body opacity-60"
          title={leadAddress || undefined}
        >
          {leadAddress || '—'}
        </div>

        <CrmPhoneCell phone={record.lead?.phone} />
        <CrmEmailCell email={record.lead?.email} />

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
