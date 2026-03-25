import { useState, useMemo, useCallback } from 'react'
import { X, Search, ChevronDown, ChevronRight, Users, MapPin, Clock, ArrowUpDown, Filter, SlidersHorizontal } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { cn } from '@/lib/utils'
import { formatTimeInState, getStreetAddress, loadLeads, saveLeads } from '../utils/dealPipeline'
import { LeadDetails } from './LeadDetails'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'address', label: 'Address A–Z' },
  { value: 'owner', label: 'Owner A–Z' },
  { value: 'stage', label: 'Stage Order' },
]

function getColumnName(colId, columns) {
  const col = columns.find(c => c.id === colId)
  return col?.name || colId
}

function sortLeads(leads, sortBy, columns) {
  const sorted = [...leads]
  switch (sortBy) {
    case 'newest':
      return sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    case 'oldest':
      return sorted.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    case 'address':
      return sorted.sort((a, b) => (a.address || '').localeCompare(b.address || ''))
    case 'owner':
      return sorted.sort((a, b) => (a.owner || '').localeCompare(b.owner || ''))
    case 'stage': {
      const order = {}
      columns.forEach((c, i) => { order[c.id] = i })
      return sorted.sort((a, b) => (order[a.status] ?? 999) - (order[b.status] ?? 999))
    }
    default:
      return sorted
  }
}

function LeadCard({ lead, columns, pipelineTitle, onClick }) {
  const stageName = getColumnName(lead.status, columns)
  const timeStr = formatTimeInState(lead)
  return (
    <div
      className="leads-card flex flex-col gap-1 px-3.5 py-3 rounded-lg cursor-pointer active:scale-[0.98] transition-transform"
      onClick={() => onClick?.(lead)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(lead)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium truncate flex-1">{lead.address || 'Unknown'}</div>
      </div>
      {lead.owner && (
        <div className="text-xs opacity-60 truncate">{lead.owner}</div>
      )}
      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
        <span className="leads-stage-badge inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium">
          {stageName}
        </span>
        {timeStr && (
          <span className="text-[11px] opacity-40 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeStr}
          </span>
        )}
        {pipelineTitle && (
          <span className="text-[11px] opacity-30 truncate max-w-[120px]">{pipelineTitle}</span>
        )}
      </div>
    </div>
  )
}

export function LeadsPanel({
  isOpen,
  onClose,
  pipelines = [],
  dealPipelineLeads = [],
  onOpenDealPipeline,
  onOpenParcelDetails,
  onEmailClick,
  onPhoneClick,
  onSkipTraceParcel,
  skipTracingInProgress,
  onLeadsChange,
  onOpenScheduleAtDate,
}) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [filterStage, setFilterStage] = useState('all')
  const [filterPipeline, setFilterPipeline] = useState('all')
  const [showSortFilter, setShowSortFilter] = useState(false)
  const [collapsedPipelines, setCollapsedPipelines] = useState({})
  const [selectedLead, setSelectedLead] = useState(null)

  const allPipelineData = useMemo(() => {
    if (pipelines.length > 0) {
      return pipelines.map(p => ({
        id: p.id,
        title: p.title || 'Deal Pipeline',
        columns: p.columns || [],
        leads: p.leads || [],
      }))
    }
    if (dealPipelineLeads.length > 0) {
      return [{
        id: '_local',
        title: 'Deal Pipeline',
        columns: (() => { try { return JSON.parse(localStorage.getItem('deal_pipeline_columns')) || [] } catch { return [] } })(),
        leads: dealPipelineLeads,
      }]
    }
    return []
  }, [pipelines, dealPipelineLeads])

  const allStages = useMemo(() => {
    const map = new Map()
    allPipelineData.forEach(p => {
      p.columns.forEach(c => {
        if (!map.has(c.id)) map.set(c.id, c.name)
      })
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [allPipelineData])

  const filteredPipelines = useMemo(() => {
    const q = search.toLowerCase().trim()
    return allPipelineData
      .filter(p => filterPipeline === 'all' || p.id === filterPipeline)
      .map(p => {
        let leads = p.leads
        if (filterStage !== 'all') {
          leads = leads.filter(l => l.status === filterStage)
        }
        if (q) {
          leads = leads.filter(l =>
            (l.address || '').toLowerCase().includes(q) ||
            (l.owner || '').toLowerCase().includes(q)
          )
        }
        leads = sortLeads(leads, sortBy, p.columns)
        return { ...p, leads }
      })
  }, [allPipelineData, search, sortBy, filterStage, filterPipeline])

  const totalLeads = filteredPipelines.reduce((sum, p) => sum + p.leads.length, 0)
  const totalAll = allPipelineData.reduce((sum, p) => sum + p.leads.length, 0)

  const toggleCollapse = (pid) => {
    setCollapsedPipelines(prev => ({ ...prev, [pid]: !prev[pid] }))
  }

  const leadToParcelData = (lead) => ({
    id: lead.parcelId,
    address: lead.address,
    properties: lead.properties || { OWNER_NAME: lead.owner, SITUS_ADDR: lead.address, LATITUDE: lead.lat, LONGITUDE: lead.lng },
    lat: lead.lat,
    lng: lead.lng,
  })

  const allLeads = useMemo(() => allPipelineData.flatMap(p => p.leads), [allPipelineData])

  const handleLeadUpdate = useCallback((updated) => {
    setSelectedLead(updated)
    if (onLeadsChange) {
      onLeadsChange(allLeads.map(l => l.id === updated.id ? updated : l))
    } else {
      const stored = loadLeads()
      saveLeads(stored.map(l => l.id === updated.id ? updated : l))
    }
  }, [allLeads, onLeadsChange])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setSelectedLead(null); onClose() } }}>
      <DialogContent
        className="map-panel list-panel fullscreen-panel"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/20" style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
          <DialogDescription className="sr-only">All leads across your deal pipelines</DialogDescription>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" />
              Leads
              {totalAll > 0 && (
                <span className="text-sm font-normal opacity-50 ml-1">{totalAll}</span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSortFilter(v => !v)}
                title="Sort & Filter"
                className={cn(showSortFilter && "opacity-100")}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search leads by address or owner..."
              className="w-full text-sm rounded-lg pl-9 pr-3 py-2"
            />
          </div>

          {/* Sort & Filter bar */}
          {showSortFilter && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs opacity-50 flex items-center gap-1"><ArrowUpDown className="h-3 w-3" /> Sort</span>
                <div className="settings-segmented inline-flex rounded-lg p-0.5 gap-0.5 flex-wrap">
                  {SORT_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setSortBy(o.value)}
                      className={cn(
                        "px-2 py-0.5 text-[11px] font-medium rounded-md transition-all",
                        sortBy === o.value && "seg-active"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {allStages.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs opacity-50 flex items-center gap-1"><Filter className="h-3 w-3" /> Stage</span>
                  <div className="settings-segmented inline-flex rounded-lg p-0.5 gap-0.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setFilterStage('all')}
                      className={cn(
                        "px-2 py-0.5 text-[11px] font-medium rounded-md transition-all",
                        filterStage === 'all' && "seg-active"
                      )}
                    >
                      All
                    </button>
                    {allStages.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setFilterStage(s.id)}
                        className={cn(
                          "px-2 py-0.5 text-[11px] font-medium rounded-md transition-all",
                          filterStage === s.id && "seg-active"
                        )}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {allPipelineData.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs opacity-50 flex items-center gap-1"><Users className="h-3 w-3" /> Pipeline</span>
                  <div className="settings-segmented inline-flex rounded-lg p-0.5 gap-0.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setFilterPipeline('all')}
                      className={cn(
                        "px-2 py-0.5 text-[11px] font-medium rounded-md transition-all",
                        filterPipeline === 'all' && "seg-active"
                      )}
                    >
                      All
                    </button>
                    {allPipelineData.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setFilterPipeline(p.id)}
                        className={cn(
                          "px-2 py-0.5 text-[11px] font-medium rounded-md transition-all",
                          filterPipeline === p.id && "seg-active"
                        )}
                      >
                        {p.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 space-y-3" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          {totalAll === 0 ? (
            <div className="text-center py-16">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm opacity-60">No leads yet.</p>
              <p className="text-xs opacity-40 mt-1">Convert parcels to leads from the map or parcel details.</p>
              {onOpenDealPipeline && (
                <button
                  type="button"
                  onClick={() => { onClose(); onOpenDealPipeline() }}
                  className="settings-data-btn mt-4 inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  Open Deal Pipeline
                </button>
              )}
            </div>
          ) : totalLeads === 0 ? (
            <div className="text-center py-12">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm opacity-60">No leads match your filters.</p>
            </div>
          ) : (
            filteredPipelines.map(pipeline => {
              if (pipeline.leads.length === 0) return null
              const collapsed = collapsedPipelines[pipeline.id]
              const showHeader = allPipelineData.length > 1

              return (
                <div key={pipeline.id}>
                  {showHeader && (
                    <button
                      type="button"
                      onClick={() => toggleCollapse(pipeline.id)}
                      className="w-full flex items-center gap-2 py-2 text-sm font-semibold opacity-80 hover:opacity-100 transition-opacity"
                    >
                      {collapsed
                        ? <ChevronRight className="h-4 w-4 opacity-50" />
                        : <ChevronDown className="h-4 w-4 opacity-50" />
                      }
                      <span>{pipeline.title}</span>
                      <span className="text-xs font-normal opacity-50">{pipeline.leads.length}</span>
                    </button>
                  )}
                  {!collapsed && (
                    <div className="space-y-1.5">
                      {pipeline.leads.map(lead => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          columns={pipeline.columns}
                          pipelineTitle={showHeader ? null : pipeline.title}
                          onClick={setSelectedLead}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </DialogContent>

      <LeadDetails
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        lead={selectedLead}
        parcelData={selectedLead ? leadToParcelData(selectedLead) : null}
        onOpenParcelDetails={onOpenParcelDetails}
        onEmailClick={onEmailClick}
        onPhoneClick={onPhoneClick}
        onSkipTraceParcel={onSkipTraceParcel}
        isSkipTracingInProgress={selectedLead && skipTracingInProgress?.has?.(selectedLead.parcelId)}
        onLeadUpdate={handleLeadUpdate}
        onTasksChange={() => {}}
        onViewTaskOnSchedule={onOpenScheduleAtDate ? (task) => {
          if (task?.scheduledAt) {
            setSelectedLead(null)
            onClose()
            onOpenScheduleAtDate(task.scheduledAt)
          }
        } : undefined}
      />
    </Dialog>
  )
}
