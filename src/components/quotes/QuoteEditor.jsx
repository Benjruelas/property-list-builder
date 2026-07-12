import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, Search, X, ChevronDown, ChevronRight } from 'lucide-react'
import { PipelineDropdown } from '../PipelineDropdown'
import { InlineDropdown } from '../InlineDropdown'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from '../ui/dialog'
import { handleChildPanelDismiss } from '../ui/panelDialogUtils'
import { PanelHeader } from '../ui/panel-header'
import { Button } from '../ui/button'
import { showToast } from '../ui/toast'
import { SchedulePicker } from '../SchedulePicker'
import { QuoteLineItemsEditor } from './QuoteLineItemsEditor'
import { computeQuoteTotals, defaultValidUntil, createQuoteLineItem } from '@/utils/quoteMath'
import { createQuote, updateQuote, createQuoteTemplate } from '@/utils/quotes'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { cn } from '@/lib/utils'

const FIELD =
  'w-full min-w-0 max-w-full bg-white/5 border border-white/15 rounded-md px-3 py-2.5 text-sm min-h-[44px] box-border'
const PANEL_HORIZONTAL_PADDING = {
  paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
  paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
}
const leadRowClass =
  'map-panel-list-item flex flex-col gap-0.5 w-full text-left px-3 py-2.5 rounded-lg border transition-all cursor-pointer min-h-[44px]'

function filterLeads(leads, query) {
  const q = query.toLowerCase().trim()
  const sorted = [...leads].sort((a, b) =>
    (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
  )
  if (!q) return sorted
  const tokens = q.split(/\s+/).filter(Boolean)
  return sorted.filter((lead) => {
    const name = displayLeadName(lead).toLowerCase()
    const address = (lead.address || '').toLowerCase()
    const email = (lead.email || '').toLowerCase()
    const phone = (lead.phone || '').toLowerCase()
    const searchable = [name, address, email, phone].filter(Boolean).join(' ')
    return tokens.every((tok) => searchable.includes(tok))
  })
}

function SelectedLeadCard({ lead, onClear }) {
  return (
    <div
      className={cn(
        leadRowClass,
        'grid grid-cols-[minmax(0,1fr)_2rem] grid-rows-[auto_auto] gap-x-0 pl-3 pr-2 py-2.5 border-white/20 bg-white/[0.06] cursor-default'
      )}
    >
      <div className="min-w-0 col-start-1 row-start-1 self-center">
        <div className="text-sm font-medium truncate leading-5">{displayLeadName(lead)}</div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="col-start-2 row-start-1 self-center justify-self-center h-8 w-8 shrink-0 opacity-60 hover:opacity-100"
        onClick={onClear}
        aria-label="Clear lead"
      >
        <X className="h-4 w-4" />
      </Button>
      {(formatLeadAddress(lead) || lead.email) && (
        <div className="min-w-0 col-start-1 row-start-2 text-xs opacity-60 truncate mt-0.5">
          {formatLeadAddress(lead) || lead.email || 'No address'}
        </div>
      )}
    </div>
  )
}

function validUntilToTimestamp(iso) {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 12, 0, 0).getTime()
}

function timestampToValidUntil(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  date.setHours(12, 0, 0, 0)
  return date.toISOString()
}

function startOfTodayTimestamp() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function leadClientFields(lead) {
  if (!lead) return { clientName: '', clientEmail: '', clientPhone: '' }
  return {
    clientName: displayLeadName(lead),
    clientEmail: lead.email || '',
    clientPhone: lead.phone || '',
  }
}

export function QuoteEditor({
  open,
  onClose,
  getToken,
  quote = null,
  template = null,
  mode = 'quote',
  leads = [],
  pipelines = [],
  onSaved,
  canSeeDealAmounts = true,
}) {
  const isTemplate = mode === 'template'
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [name, setName] = useState('')
  const [lineItems, setLineItems] = useState([])
  const [taxRate, setTaxRate] = useState(0)
  const [globalMarkupPercent, setGlobalMarkupPercent] = useState(0)
  const [terms, setTerms] = useState('')
  const [notes, setNotes] = useState('')
  const [validUntil, setValidUntil] = useState(defaultValidUntil(30))
  const [leadId, setLeadId] = useState('')
  const [leadSearch, setLeadSearch] = useState('')
  const [leadPickerOpen, setLeadPickerOpen] = useState(true)
  const [pipelineId, setPipelineId] = useState('')
  const [dealId, setDealId] = useState('')
  const [validUntilExpanded, setValidUntilExpanded] = useState(true)

  const selectedLead = useMemo(() => leads.find((l) => l.id === leadId) || null, [leads, leadId])
  const filteredLeads = useMemo(() => filterLeads(leads, leadSearch), [leads, leadSearch])

  useEffect(() => {
    if (!open) return
    const src = quote || template
    if (src) {
      setTitle(src.title || '')
      setName(src.name || src.title || '')
      setLineItems(
        src.lineItems?.length
          ? src.lineItems.map((i) => createQuoteLineItem(i))
          : []
      )
      setTaxRate(src.taxRate || 0)
      setGlobalMarkupPercent(src.globalMarkupPercent ?? 0)
      setTerms(src.terms || '')
      setNotes(src.notes || '')
      setValidUntil(src.validUntil || defaultValidUntil(src.defaultValidDays || 30))
      setLeadId(src.leadId || '')
      setLeadPickerOpen(!src.leadId)
      setPipelineId(src.pipelineId || '')
      setDealId(src.dealId || '')
    } else {
      setTitle('')
      setName('')
      setLineItems([])
      setTaxRate(0)
      setGlobalMarkupPercent(0)
      setTerms('')
      setNotes('')
      setValidUntil(defaultValidUntil(30))
      setLeadId('')
      setLeadPickerOpen(true)
      setLeadSearch('')
      setPipelineId('')
      setDealId('')
    }
    setValidUntilExpanded(true)
  }, [open, quote, template])

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId)
  const selectedDeal = selectedPipeline?.deals?.find((d) => d.id === dealId)
  const dealOptions = useMemo(
    () =>
      (selectedPipeline?.deals || []).map((d) => ({
        id: d.id,
        label: d.title || d.leadName || d.id,
      })),
    [selectedPipeline]
  )

  useEffect(() => {
    if (selectedDeal?.leadId && !leadId) {
      setLeadId(selectedDeal.leadId)
      setLeadPickerOpen(false)
    }
  }, [selectedDeal?.leadId, leadId])

  const handleLineItemsChange = useCallback((items, rate) => {
    setLineItems(items)
    setTaxRate(rate)
  }, [])

  const buildPayload = () => {
    const totals = computeQuoteTotals(lineItems, taxRate)
    const client = leadClientFields(selectedLead)
    const base = {
      title: isTemplate ? (title.trim() || 'Quote') : title.trim(),
      lineItems: totals.lineItems,
      taxRate: totals.taxRate,
      terms,
      notes,
      validUntil,
      globalMarkupPercent: globalMarkupPercent || null,
    }
    if (isTemplate) {
      return { ...base, name: name.trim() || title.trim() || 'Template', defaultValidDays: 30 }
    }
    return {
      ...base,
      leadId: leadId || null,
      ...client,
      pipelineId: pipelineId || null,
      dealId: dealId || null,
      paymentEnabled: false,
      templateId: template?.id || quote?.templateId || null,
    }
  }

  const handleSave = async () => {
    if (!isTemplate) {
      if (!title.trim()) {
        showToast('Enter a quote title', 'error')
        return
      }
      if (!leadId) {
        showToast('Select a lead for this quote', 'error')
        return
      }
    }
    setSaving(true)
    try {
      const payload = buildPayload()
      let saved
      if (isTemplate) {
        if (template?.id) {
          const { updateQuoteTemplate } = await import('@/utils/quotes')
          saved = await updateQuoteTemplate(getToken, template.id, payload)
        } else {
          saved = await createQuoteTemplate(getToken, payload)
        }
      } else if (quote?.id) {
        saved = await updateQuote(getToken, quote.id, payload)
      } else {
        saved = await createQuote(getToken, payload)
      }
      showToast(isTemplate ? 'Template saved' : 'Quote saved', 'success')
      onSaved?.(saved)
      if (!onSaved) onClose?.()
    } catch (e) {
      showToast(e.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAsTemplate = async () => {
    setSaving(true)
    try {
      const payload = buildPayload()
      await createQuoteTemplate(getToken, {
        name: `${title || 'Quote'} Template`,
        title: payload.title,
        lineItems: payload.lineItems,
        terms: payload.terms,
        notes: payload.notes,
        taxRate: payload.taxRate,
      })
      showToast('Saved as template', 'success')
    } catch (e) {
      showToast(e.message || 'Failed to save template', 'error')
    } finally {
      setSaving(false)
    }
  }

  const selectLead = (lead) => {
    setLeadId(lead.id)
    setLeadPickerOpen(false)
    setLeadSearch('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => handleChildPanelDismiss(o, onClose, { wasOpen: open })}>
      <DialogContent
        className="map-panel list-panel quotes-panel quote-editor-panel fullscreen-panel flex flex-col min-h-0 overflow-hidden p-0 max-md:w-full max-md:max-w-none"
        showCloseButton={false}
        nestedOverlay
        topLayer
      >
        <DialogHeader
          className="flex-shrink-0 pb-3 border-b border-white/20 text-left"
          style={{ ...PANEL_HORIZONTAL_PADDING, paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
        >
          <DialogDescription className="sr-only">
            {isTemplate ? 'Edit quote template' : 'Edit quote'}
          </DialogDescription>
          <PanelHeader
            onBack={onClose}
            title={quote?.id || template?.id ? (isTemplate ? 'Edit template' : 'Edit quote') : (isTemplate ? 'New template' : 'New quote')}
          />
        </DialogHeader>

        <div
          className="flex-1 min-h-0 min-w-0 max-w-full overflow-x-clip overflow-y-auto scrollbar-hide overscroll-contain py-4 space-y-4"
          style={{
            ...PANEL_HORIZONTAL_PADDING,
            paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {isTemplate && (
            <label className="block space-y-1">
              <span className="text-xs opacity-70">Template name</span>
              <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-xs opacity-70">
              Quote title
              {!isTemplate && <span className="text-red-400"> *</span>}
            </span>
            <input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          {!isTemplate && (
            <>
              <div className="space-y-2">
                <span className="text-xs opacity-70">Lead <span className="text-red-400">*</span></span>
                {selectedLead && !leadPickerOpen ? (
                  <SelectedLeadCard lead={selectedLead} onClear={() => { setLeadId(''); setLeadPickerOpen(true) }} />
                ) : (
                  <div className="rounded-lg border border-white/15 bg-white/[0.03] overflow-hidden">
                    <div className="relative border-b border-white/10">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
                      <input
                        type="search"
                        value={leadSearch}
                        onChange={(e) => setLeadSearch(e.target.value)}
                        placeholder="Search leads…"
                        className="w-full text-sm pl-9 pr-3 py-2.5 bg-transparent border-0 outline-none"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto scrollbar-hide">
                      {filteredLeads.length === 0 ? (
                        <p className="text-xs opacity-50 px-3 py-3">No leads found</p>
                      ) : (
                        filteredLeads.slice(0, 20).map((lead) => (
                          <button
                            key={lead.id}
                            type="button"
                            className={cn(leadRowClass, 'border-transparent hover:bg-white/[0.06] w-full')}
                            onClick={() => selectLead(lead)}
                          >
                            <div className="text-sm font-medium truncate">{displayLeadName(lead)}</div>
                            <div className="text-xs opacity-60 truncate">{formatLeadAddress(lead) || lead.email || ''}</div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="min-w-0 max-w-full rounded-lg border border-white/15 bg-white/[0.03] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setValidUntilExpanded((v) => !v)}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-white/90 hover:bg-white/5 transition-colors"
                  aria-expanded={validUntilExpanded}
                >
                  {validUntilExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
                  )}
                  <span>Valid until</span>
                </button>
                {validUntilExpanded && (
                  <div className="border-t border-white/15 px-3 pb-3 pt-2 space-y-1 min-w-0 max-w-full overflow-hidden">
                    <SchedulePicker
                      inline
                      hideLabel
                      dateOnly
                      untilLabel="Until"
                      value={validUntilToTimestamp(validUntil)}
                      onChange={(ts) => setValidUntil(timestampToValidUntil(ts))}
                      minDate={startOfTodayTimestamp()}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-1 border-t border-white/10">
                <span className="text-xs opacity-70">Link to deal (optional)</span>
                <PipelineDropdown
                  showLabel={false}
                  allowEmpty
                  value={pipelineId}
                  onChange={(id) => {
                    setPipelineId(id)
                    setDealId('')
                  }}
                  pipelines={pipelines}
                  placeholder="No pipeline"
                />
                {selectedPipeline && (
                  <InlineDropdown
                    showLabel={false}
                    allowEmpty
                    value={dealId}
                    onChange={setDealId}
                    options={dealOptions}
                    placeholder="No deal"
                    emptyLabel="No deal"
                  />
                )}
              </div>
            </>
          )}

          <QuoteLineItemsEditor
            lineItems={lineItems}
            taxRate={taxRate}
            globalMarkupPercent={globalMarkupPercent}
            onChange={handleLineItemsChange}
            onGlobalMarkupChange={setGlobalMarkupPercent}
            showAmounts={canSeeDealAmounts}
            showProfit={canSeeDealAmounts}
          />

          <label className="block space-y-1">
            <span className="text-xs opacity-70">Terms (shown to client on quote link)</span>
            <textarea className={FIELD + ' min-h-[80px]'} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs opacity-70">Notes (internal — not shown to client)</span>
            <textarea className={FIELD + ' min-h-[60px]'} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="flex flex-col gap-2 pt-2">
            <Button className="create-list-btn w-full" disabled={saving} onClick={handleSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
            {!isTemplate && (
              <Button variant="outline" className="w-full" disabled={saving} onClick={handleSaveAsTemplate}>
                Save as template
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
