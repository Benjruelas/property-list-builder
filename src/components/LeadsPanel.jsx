import { useState, useMemo, useCallback } from 'react'
import { X, Search, ChevronDown, ChevronRight, UserSearch, Clock, Archive } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { formatTimeInState, loadLeads, saveLeads } from '../utils/dealPipeline'
import { LeadDetails } from './LeadDetails'
import { EditLeadTaskDialog } from './EditLeadTaskDialog'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'

function getColumnName(colId, columns) {
  const col = columns.find(c => c.id === colId)
  return col?.name || colId
}

/** Separate list items (spaced, rounded), same border language as ListPanel. */
const leadListRowClass =
  'map-panel-list-item leads-panel-list-item flex flex-col gap-1 px-3.5 py-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer'

function LeadCard({ lead, columns, pipelineTitle, onClick }) {
  const stageName = getColumnName(lead.status, columns)
  const timeStr = formatTimeInState(lead)
  return (
    <div
      className={leadListRowClass}
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

function ClosedLeadCard({ lead, onClick }) {
  const closedDate = lead.closedAt
    ? new Date(lead.closedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  return (
    <div
      className={leadListRowClass}
      onClick={() => onClick?.(lead)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(lead)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium truncate flex-1">{lead.lead?.address || 'Unknown'}</div>
      </div>
      {lead.lead?.owner && (
        <div className="text-xs opacity-60 truncate">{lead.lead.owner}</div>
      )}
      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
        <span className="leads-stage-badge inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium">
          Closed
        </span>
        {closedDate && (
          <span className="text-[11px] opacity-40 flex items-center gap-1">
            <Archive className="h-3 w-3" />
            {closedDate}
          </span>
        )}
        {lead.closedFrom?.title && (
          <span className="text-[11px] opacity-30 truncate max-w-[120px]">{lead.closedFrom.title}</span>
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
  closedLeads = [],
  onOpenDealPipeline,
  onOpenParcelDetails,
  onEmailClick,
  onPhoneClick,
  onSkipTraceParcel,
  skipTracingInProgress,
  onLeadsChange,
  onOpenScheduleAtDate,
  onRequestMoveLead,
  onRequestRemoveLead,
  onRequestCloseLead,
  onDeleteClosedLead,
  onRequestReopenLead,
  onGoToParcelOnMap,
  onOpenAddTask,
  onPipelinesChange,
  getToken,
  teams = [],
}) {
  const { scheduleSync } = useUserDataSync()
  const [search, setSearch] = useState('')
  const [collapsedPipelines, setCollapsedPipelines] = useState({})
  const [selectedLead, setSelectedLead] = useState(null)
  const [selectedLeadPipelineId, setSelectedLeadPipelineId] = useState(null)
  const [selectedClosedLead, setSelectedClosedLead] = useState(null)
  const [editTaskContext, setEditTaskContext] = useState(null)
  const [leadDetailsTaskEpoch, setLeadDetailsTaskEpoch] = useState(0)
  const [tab, setTab] = useState('active')

  const allPipelineData = useMemo(() => {
    if (pipelines.length > 0) {
      return pipelines.map(p => ({
        id: p.id,
        title: p.title || 'Pipes',
        columns: p.columns || [],
        leads: p.leads || [],
      }))
    }
    if (dealPipelineLeads.length > 0) {
      return [{
        id: '_local',
        title: 'Pipes',
        columns: (() => { try { return JSON.parse(localStorage.getItem('deal_pipeline_columns')) || [] } catch { return [] } })(),
        leads: dealPipelineLeads,
      }]
    }
    return []
  }, [pipelines, dealPipelineLeads])

  const filteredPipelines = useMemo(() => {
    const q = search.toLowerCase().trim()
    return allPipelineData.map((p) => {
      let leads = [...p.leads].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      if (q) {
        leads = leads.filter((l) =>
          (l.address || '').toLowerCase().includes(q) ||
          (l.owner || '').toLowerCase().includes(q)
        )
      }
      return { ...p, leads }
    })
  }, [allPipelineData, search])

  const displayLeads = useMemo(() => {
    if (pipelines.length > 0) {
      return pipelines.flatMap((p) => (p.leads || []).map((l) => ({ ...l, __pipelineId: p.id, __pipelineTitle: p.title })))
    }
    if (dealPipelineLeads.length > 0) return dealPipelineLeads
    return loadLeads()
  }, [pipelines, dealPipelineLeads])

  const totalLeads = filteredPipelines.reduce((sum, p) => sum + p.leads.length, 0)
  const totalAll = allPipelineData.reduce((sum, p) => sum + p.leads.length, 0)

  const filteredClosedLeads = useMemo(() => {
    const q = search.toLowerCase().trim()
    const sorted = [...closedLeads].sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
    if (!q) return sorted
    return sorted.filter((l) =>
      (l.lead?.address || '').toLowerCase().includes(q) ||
      (l.lead?.owner || '').toLowerCase().includes(q) ||
      (l.closedFrom?.title || '').toLowerCase().includes(q)
    )
  }, [closedLeads, search])

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

  const handleLeadUpdate = useCallback((updated) => {
    setSelectedLead(updated)
    if (onLeadsChange) {
      const pipeline = allPipelineData.find(p => p.leads.some(l => l.id === updated.id))
      if (pipeline) {
        onLeadsChange(pipeline.leads.map(l => l.id === updated.id ? updated : l), pipeline.id)
      }
    } else {
      const stored = loadLeads()
      saveLeads(stored.map(l => l.id === updated.id ? updated : l))
    }
  }, [allPipelineData, onLeadsChange])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setSelectedLead(null); setSelectedLeadPipelineId(null); setEditTaskContext(null); onClose() } }}>
      <DialogContent
        className="map-panel list-panel fullscreen-panel"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className="px-5 pt-5 pb-0 border-b-0 text-left" style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
          <DialogDescription className="sr-only">All leads across your pipelines</DialogDescription>
          <div className="map-panel-header-toolbar">
            <DialogTitle className="map-panel-header-title-wrap text-xl font-semibold flex items-center gap-2 min-w-0 truncate">
              <UserSearch className="h-5 w-5 shrink-0" />
              <span className="truncate">Leads</span>
            </DialogTitle>
            <div className="map-panel-header-actions gap-1">
              <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-4 border-b border-white/10" role="tablist" aria-label="Lead status">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'active'}
              onClick={() => setTab('active')}
              className={`relative pb-2 text-sm font-medium transition-colors ${tab === 'active' ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}
            >
              <span className="inline-flex items-center gap-2">
                Active
                <span className="text-xs font-normal opacity-60">{totalAll}</span>
              </span>
              {tab === 'active' && (
                <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-current" aria-hidden />
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'closed'}
              onClick={() => setTab('closed')}
              className={`relative pb-2 text-sm font-medium transition-colors ${tab === 'closed' ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}
            >
              <span className="inline-flex items-center gap-2">
                Closed
                <span className="text-xs font-normal opacity-60">{closedLeads.length}</span>
              </span>
              {tab === 'closed' && (
                <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-current" aria-hidden />
              )}
            </button>
          </div>

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'active' ? 'Search leads by address or owner...' : 'Search closed leads...'}
              className="w-full text-sm rounded-lg pl-9 pr-3 py-2"
              aria-label="Search leads"
            />
          </div>

        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 space-y-3" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          {tab === 'active' ? (
            totalAll === 0 ? (
              <div className="text-center py-16">
                <UserSearch className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm opacity-60">No leads yet.</p>
                <p className="text-xs opacity-40 mt-1">Convert parcels to leads from the map or parcel details.</p>
                {onOpenDealPipeline && (
                  <button
                    type="button"
                    onClick={() => { onClose(); onOpenDealPipeline() }}
                    className="settings-data-btn mt-4 inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors"
                  >
                    Open Pipes
                  </button>
                )}
              </div>
            ) : totalLeads === 0 ? (
              <div className="text-center py-12">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm opacity-60">No leads match your search.</p>
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
                            onClick={() => { setSelectedLead(lead); setSelectedLeadPipelineId(pipeline.id) }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )
          ) : (
            closedLeads.length === 0 ? (
              <div className="text-center py-16">
                <Archive className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm opacity-60">No closed leads yet.</p>
                <p className="text-xs opacity-40 mt-1">When you close a lead from its Lead Details panel it will be archived here with all its notes, tasks, and stage history.</p>
                <p className="text-xs opacity-30 mt-2">Closed leads sync with your account so they stay available across devices.</p>
              </div>
            ) : filteredClosedLeads.length === 0 ? (
              <div className="text-center py-12">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm opacity-60">No closed leads match your search.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredClosedLeads.map((cl) => (
                  <ClosedLeadCard
                    key={cl.id}
                    lead={cl}
                    onClick={() => setSelectedClosedLead(cl)}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </DialogContent>

      <LeadDetails
        isOpen={!!selectedLead}
        onClose={() => { setSelectedLead(null); setSelectedLeadPipelineId(null) }}
        lead={selectedLead}
        pipelineId={pipelines.length > 0 ? selectedLeadPipelineId : null}
        pipelineTeamShares={pipelines.length > 0 && selectedLeadPipelineId
          ? (pipelines.find((p) => p.id === selectedLeadPipelineId)?.teamShares || [])
          : []}
        teams={teams}
        pipelines={pipelines}
        onPipelinesChange={onPipelinesChange}
        onTeamTasksChange={onPipelinesChange}
        getToken={getToken}
        parcelData={selectedLead ? leadToParcelData(selectedLead) : null}
        onOpenParcelDetails={onOpenParcelDetails}
        onEmailClick={onEmailClick}
        onPhoneClick={onPhoneClick}
        onSkipTraceParcel={onSkipTraceParcel}
        isSkipTracingInProgress={selectedLead && skipTracingInProgress?.has?.(selectedLead.parcelId)}
        onLeadUpdate={handleLeadUpdate}
        onTasksChange={() => {}}
        taskListEpoch={leadDetailsTaskEpoch}
        onViewTaskOnSchedule={onOpenScheduleAtDate ? (task) => {
          if (task?.scheduledAt) {
            setSelectedLead(null)
            onClose()
            onOpenScheduleAtDate(task.scheduledAt)
          }
        } : undefined}
        onOpenEditTask={(t, l) => {
          if (t) setEditTaskContext({ task: t, lead: l || null })
        }}
        pipelineName={pipelines.length > 0 ? (pipelines.find(p => p.id === selectedLeadPipelineId)?.title || 'Pipes') : null}
        onRequestMoveLead={onRequestMoveLead}
        onRequestRemoveLead={onRequestRemoveLead}
        onRequestCloseLead={onRequestCloseLead}
        onGoToParcelOnMap={onGoToParcelOnMap}
        onGoToPipeline={onOpenDealPipeline ? (pid) => {
          setSelectedLead(null)
          setSelectedLeadPipelineId(null)
          onClose()
          onOpenDealPipeline(pid)
        } : undefined}
        onOpenAddTask={onOpenAddTask ? (lead) => {
          if (lead) {
            const pid = selectedLeadPipelineId
            setSelectedLead(null)
            setSelectedLeadPipelineId(null)
            onOpenAddTask(lead, pid)
          }
        } : undefined}
      />

      <EditLeadTaskDialog
        open={!!editTaskContext}
        onOpenChange={(o) => { if (!o) setEditTaskContext(null) }}
        context={editTaskContext}
        pipelines={pipelines}
        teams={teams}
        displayLeads={displayLeads}
        getToken={getToken}
        onPipelinesChange={onPipelinesChange}
        scheduleSync={scheduleSync}
        onSaved={() => {
          onPipelinesChange?.()
          setLeadDetailsTaskEpoch((e) => e + 1)
        }}
      />

      <LeadDetails
        isOpen={!!selectedClosedLead}
        onClose={() => setSelectedClosedLead(null)}
        lead={selectedClosedLead?.lead || null}
        parcelData={selectedClosedLead?.lead ? leadToParcelData(selectedClosedLead.lead) : null}
        closedRecord={selectedClosedLead}
        onOpenParcelDetails={onOpenParcelDetails}
        onEmailClick={onEmailClick}
        onPhoneClick={onPhoneClick}
        onLeadUpdate={() => {}}
        onTasksChange={() => {}}
        onGoToParcelOnMap={onGoToParcelOnMap}
        onRequestReopenLead={onRequestReopenLead ? (rec) => {
          setSelectedClosedLead(null)
          onRequestReopenLead(rec)
        } : undefined}
        onRequestDeleteClosedLead={onDeleteClosedLead ? (id) => {
          setSelectedClosedLead(null)
          onDeleteClosedLead(id)
        } : undefined}
      />
    </Dialog>
  )
}
