import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus,
  Loader2,
  MoreVertical,
  Pencil,
  Send,
  Trash2,
  Copy,
  MessageSquare,
  Search,
} from 'lucide-react'
import { QuoteIcon } from '../icons/QuoteIcon'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from '../ui/dialog'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE, PanelCreateButton, PanelOptionsButton } from '../ui/panel-header'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { showToast } from '../ui/toast'
import { showConfirm } from '../ui/confirm-dialog'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  fetchQuotes,
  fetchQuoteTemplates,
  deleteQuote,
  deleteQuoteTemplate,
  createQuoteTemplate,
  sendQuoteEmail,
} from '../../utils/quotes'
import { DEFAULT_QUOTE_TEMPLATE } from '../../utils/quoteMath'
import { QuoteStatusBadge } from './QuoteStatusBadge'
import { OptionsMenuDropdown, OptionsMenuItem } from '../ui/OptionsMenuDropdown'
import { QuoteEditor } from './QuoteEditor'
import { QuoteDetails } from './QuoteDetails'
import { SendQuoteDialog } from './SendQuoteDialog'
import {
  QUOTE_SEND_TAGS,
  replaceQuoteTags,
  getQuoteSendTemplatesFromSettings,
  buildQuoteSendTemplatesPatch,
  DEFAULT_QUOTE_EMAIL_TEMPLATE,
  DEFAULT_QUOTE_TEXT_TEMPLATE,
} from '../../utils/quoteSendTemplates'
import { getSettings, updateSettings } from '../../utils/settings'
import { formatQuoteMoney } from '../../utils/quoteMath'
import { displayLeadName } from '../../utils/leads'

const MENU_WIDTH = 180

export function QuotesPanel({
  isOpen,
  onClose,
  onBack,
  pipelines = [],
  leads = [],
  editorFrame = null,
  detailQuoteId = null,
  onOpenEditor,
  onOpenDetail,
  onCloseEditor,
  onCloseDetail,
}) {
  const { getToken } = useAuth()
  const [tab, setTab] = useState('quotes')
  const [quotes, setQuotes] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [openMenuId, setOpenMenuId] = useState(null)
  const menuTriggerRef = useRef(null)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const headerMenuTriggerRef = useRef(null)
  const editorOpen = !!editorFrame
  const editorQuote = editorFrame?.prefill ?? editorFrame?.quote ?? null
  const editorTemplate = editorFrame?.template ?? null
  const editorMode = editorFrame?.mode ?? 'quote'
  const detailsQuote = detailQuoteId ? quotes.find((q) => q.id === detailQuoteId) : null
  const [sendQuote, setSendQuote] = useState(null)
  const [msgEmailSubject, setMsgEmailSubject] = useState('')
  const [msgEmailBody, setMsgEmailBody] = useState('')
  const [msgTextBody, setMsgTextBody] = useState('')

  const refresh = useCallback(async () => {
    if (!getToken) return
    setLoading(true)
    try {
      const [q, t] = await Promise.all([fetchQuotes(getToken), fetchQuoteTemplates(getToken)])
      setQuotes(q)
      setTemplates(t)
    } catch (e) {
      showToast(e.message || 'Failed to load quotes', 'error')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    if (isOpen) refresh()
  }, [isOpen, refresh])

  useEffect(() => {
    if (!isOpen) {
      setTab('quotes')
      setSendQuote(null)
      setOpenMenuId(null)
      setHeaderMenuOpen(false)
    }
  }, [isOpen])

  useEffect(() => {
    const t = getQuoteSendTemplatesFromSettings(getSettings())
    setMsgEmailSubject(t.email.subject)
    setMsgEmailBody(t.email.body)
    setMsgTextBody(t.text.body)
  }, [isOpen, tab])

  const leadLabel = (q) => {
    const lead = q.leadId ? leads.find((l) => l.id === q.leadId) : null
    return lead ? displayLeadName(lead) : (q.clientName || 'No lead')
  }

  const filteredQuotes = quotes.filter((q) => {
    const s = search.trim().toLowerCase()
    if (!s) return true
    return (
      (q.title || '').toLowerCase().includes(s) ||
      leadLabel(q).toLowerCase().includes(s)
    )
  })

  const filteredTemplates = templates.filter((t) => {
    const s = search.trim().toLowerCase()
    if (!s) return true
    return (t.name || t.title || '').toLowerCase().includes(s)
  })

  const openNewQuote = () => {
    onOpenEditor?.({ mode: 'quote' })
  }

  const openNewTemplate = async () => {
    if (templates.length === 0) {
      try {
        await createQuoteTemplate(getToken, DEFAULT_QUOTE_TEMPLATE)
        await refresh()
      } catch {
        /* user can still create manually */
      }
    }
    onOpenEditor?.({ mode: 'template' })
  }

  const handleDeleteQuote = async (q) => {
    try {
      await deleteQuote(getToken, q.id)
      if (detailQuoteId === q.id) onCloseDetail?.()
      await refresh()
      showToast('Quote deleted', 'success')
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error')
    }
  }

  const handleDeleteTemplate = async (t) => {
    const ok = await showConfirm({ title: 'Delete template?', destructive: true, confirmLabel: 'Delete' })
    if (!ok) return
    try {
      await deleteQuoteTemplate(getToken, t.id)
      await refresh()
      showToast('Template deleted', 'success')
    } catch (e) {
      showToast(e.message || 'Delete failed', 'error')
    }
  }

  const saveMessageTemplates = () => {
    const patch = buildQuoteSendTemplatesPatch(
      { subject: msgEmailSubject, body: msgEmailBody },
      { body: msgTextBody }
    )
    updateSettings(patch, getToken)
    showToast('Message templates saved', 'success')
  }

  const resetMessageTemplates = () => {
    setMsgEmailSubject(DEFAULT_QUOTE_EMAIL_TEMPLATE.subject)
    setMsgEmailBody(DEFAULT_QUOTE_EMAIL_TEMPLATE.body)
    setMsgTextBody(DEFAULT_QUOTE_TEXT_TEMPLATE.body)
  }

  const openMenu = (id, e) => {
    e.stopPropagation()
    menuTriggerRef.current = e.currentTarget
    setOpenMenuId(id)
  }

  const handlePanelBack = () => {
    if (editorOpen) {
      onCloseEditor?.()
      return
    }
    if (detailsQuote) {
      onCloseDetail?.()
      return
    }
    onBack?.() ?? onClose?.()
  }

  const handleDetailsClose = () => {
    onCloseDetail?.()
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(o) => { if (!o) handlePanelBack() }}>
        <DialogContent
          className="map-panel list-panel quotes-panel fullscreen-panel flex flex-col min-h-0 p-0"
          showCloseButton={false}
          hideOverlay
          onInteractOutside={(e) => {
            if (e.target.closest?.('[data-quotes-panel-menu]')) e.preventDefault()
          }}
        >
          <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'pb-4')} style={PANEL_LIST_HEADER_STYLE}>
            <DialogDescription className="sr-only">Quotes</DialogDescription>
            <PanelHeader onBack={handlePanelBack} title="Quotes">
              <PanelCreateButton onClick={openNewQuote} title="Create quote" />
              <PanelOptionsButton
                ref={headerMenuTriggerRef}
                title="Quote options"
                onClick={() => setHeaderMenuOpen(true)}
              />
            </PanelHeader>
          </DialogHeader>

          <OptionsMenuDropdown
            open={headerMenuOpen}
            onClose={() => setHeaderMenuOpen(false)}
            triggerRef={headerMenuTriggerRef}
            menuWidth={MENU_WIDTH}
            dataAttr="data-quotes-panel-menu"
          >
            <OptionsMenuItem onClick={() => { setHeaderMenuOpen(false); openNewTemplate() }}>
              <Plus className="h-4 w-4" />
              Create quote template
            </OptionsMenuItem>
            <OptionsMenuItem onClick={() => { setHeaderMenuOpen(false); setTab('templates') }}>
              <Copy className="h-4 w-4" />
              Manage templates
            </OptionsMenuItem>
          </OptionsMenuDropdown>

          <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-3 space-y-1.5 min-h-0" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            <div className="mb-3 space-y-2">
              <div className="flex gap-4">
                {[
                  { id: 'quotes', label: 'Quotes', count: quotes.length },
                  { id: 'templates', label: 'Templates', count: templates.length },
                  { id: 'messages', label: 'Messages' },
                ].map(({ id, label, count }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      'pb-1.5 text-sm font-medium border-b-2 transition-opacity',
                      tab === id ? 'opacity-100 border-white/70' : 'opacity-50 border-transparent hover:opacity-80'
                    )}
                  >
                    {label}
                    {count != null ? <span className="text-xs opacity-60 ml-1">{count}</span> : null}
                  </button>
                ))}
              </div>

              {tab !== 'messages' && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tab === 'templates' ? 'Search templates…' : 'Search quotes by title or lead…'}
                    className="w-full text-sm rounded-lg pl-9 pr-3 py-2"
                    aria-label={tab === 'templates' ? 'Search templates' : 'Search quotes'}
                  />
                </div>
              )}
            </div>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin opacity-60" />
              </div>
            ) : tab === 'quotes' ? (
              quotes.length === 0 ? (
                <div className="text-center py-16">
                  <QuoteIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm opacity-60">No quotes yet.</p>
                  <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">Create a quote to send pricing to a lead.</p>
                </div>
              ) : filteredQuotes.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm opacity-60">No quotes match your search.</p>
                </div>
              ) : (
                filteredQuotes.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    className="w-full text-left map-panel-list-item leads-panel-list-item flex items-center gap-3 p-3 rounded-lg border border-white/10"
                    onClick={() => onOpenDetail?.(q.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{q.title || 'Quote'}</span>
                        <QuoteStatusBadge status={q.status} />
                      </div>
                      <p className="text-sm opacity-70 truncate">{leadLabel(q)}</p>
                      <p className="text-sm opacity-50">{formatQuoteMoney(q.total)}</p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md opacity-50 hover:opacity-90 hover:bg-white/10"
                      onClick={(e) => openMenu(`q-${q.id}`, e)}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </button>
                ))
              )
            ) : tab === 'templates' ? (
              templates.length === 0 ? (
                <div className="text-center py-16">
                  <Copy className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm opacity-60">No templates yet.</p>
                  <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">Save a quote layout as a template to reuse on future quotes.</p>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm opacity-60">No templates match your search.</p>
                </div>
              ) : (
                filteredTemplates.map((t) => (
                  <div
                    key={t.id}
                    className="map-panel-list-item flex items-center gap-3 p-3 rounded-lg border border-white/10"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{t.name || t.title}</p>
                      <p className="text-sm opacity-50">{(t.lineItems || []).length} line items</p>
                    </div>
                    <button type="button" className="p-2 opacity-60 hover:opacity-100" onClick={() => { onOpenEditor?.({ mode: 'template', template: t }); }}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="p-2 opacity-60 hover:opacity-100 text-red-400" onClick={() => handleDeleteTemplate(t)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )
            ) : (
              <div className="space-y-4 pb-4">
                <p className="text-sm opacity-70">Default templates used when sending quotes via email or text.</p>
                <div className="flex flex-wrap gap-1">
                  {QUOTE_SEND_TAGS.map(({ tag, label }) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10" title={label}>{tag}</span>
                  ))}
                </div>
                <label className="block space-y-1">
                  <span className="text-xs opacity-60 flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Email subject</span>
                  <Input value={msgEmailSubject} onChange={(e) => setMsgEmailSubject(e.target.value)} className="bg-white/5 border-white/15" />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs opacity-60">Email body</span>
                  <textarea className="w-full min-h-[100px] bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm" value={msgEmailBody} onChange={(e) => setMsgEmailBody(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs opacity-60">Text message</span>
                  <textarea className="w-full min-h-[80px] bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm" value={msgTextBody} onChange={(e) => setMsgTextBody(e.target.value)} />
                </label>
                <div className="flex gap-2">
                  <Button className="create-list-btn flex-1" onClick={saveMessageTemplates}>Save defaults</Button>
                  <Button variant="outline" onClick={resetMessageTemplates}>Reset</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <OptionsMenuDropdown
        open={!!openMenuId}
        onClose={() => setOpenMenuId(null)}
        triggerRef={menuTriggerRef}
        menuWidth={MENU_WIDTH}
      >
        {(() => {
          const qid = openMenuId?.replace('q-', '')
          const q = quotes.find((x) => x.id === qid)
          if (!q) return null
          return (
            <>
              <OptionsMenuItem onClick={() => { setSendQuote(q); setOpenMenuId(null) }}>
                <Send className="h-4 w-4" /> Send
              </OptionsMenuItem>
              <OptionsMenuItem onClick={() => { onOpenEditor?.({ mode: 'quote', quote: q }); setOpenMenuId(null) }}>
                <Pencil className="h-4 w-4" /> Edit
              </OptionsMenuItem>
              <OptionsMenuItem destructive onClick={() => { handleDeleteQuote(q); setOpenMenuId(null) }}>
                <Trash2 className="h-4 w-4" /> Delete
              </OptionsMenuItem>
            </>
          )
        })()}
      </OptionsMenuDropdown>

      <QuoteEditor
        open={editorOpen}
        onClose={() => onCloseEditor?.()}
        getToken={getToken}
        quote={editorMode === 'quote' ? editorQuote : null}
        template={editorMode === 'template' ? editorTemplate : null}
        mode={editorMode}
        pipelines={pipelines}
        leads={leads}
        onSaved={() => refresh()}
      />

      <QuoteDetails
        quote={detailsQuote}
        open={!!detailsQuote}
        onClose={handleDetailsClose}
        leads={leads}
        onEdit={(q) => { onOpenEditor?.({ mode: 'quote', quote: q }); onCloseDetail?.() }}
        onSend={(q) => setSendQuote(q)}
        onDelete={handleDeleteQuote}
      />

      <SendQuoteDialog
        open={!!sendQuote}
        quote={sendQuote}
        leads={leads}
        onClose={() => setSendQuote(null)}
        onSent={(q) => { refresh() }}
      />
    </>
  )
}
