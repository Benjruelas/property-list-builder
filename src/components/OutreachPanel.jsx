import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
  lazy,
  Suspense,
} from 'react'
import {
  Trash2,
  Share2,
  Download,
  Search,
  Edit2,
  FileText,
  Plus,
} from 'lucide-react'
import {
  PanelHeader,
  PanelCreateButton,
  PanelOptionsButton,
  PANEL_LIST_HEADER_CLASS,
  PANEL_LIST_HEADER_STYLE,
} from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { ignoreRadixMapPanelDismiss } from './ui/panelDialogUtils'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import {
  getEmailTemplates,
  deleteEmailTemplate,
  serializeEmailTemplateForShare,
} from '../utils/emailTemplates'
import {
  getTextTemplates,
  deleteTextTemplate,
  serializeTextTemplateForShare,
} from '../utils/textTemplates'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'

const OutreachTemplateEditorDialog = lazy(() =>
  import('./outreach/OutreachTemplateEditorDialog').then((m) => ({
    default: m.OutreachTemplateEditorDialog,
  }))
)

const LIST_ROW_CLASS =
  'map-panel-list-item leads-panel-list-item flex flex-col gap-0.5 w-full text-left px-3.5 py-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer'

const TABS = [
  { id: 'email', label: 'Email' },
  { id: 'text', label: 'Text' },
]

const EMAIL_CONFIG = {
  kind: 'email',
  tabLabel: 'Email',
  getTemplates: getEmailTemplates,
  remove: deleteEmailTemplate,
  serialize: serializeEmailTemplateForShare,
}

const TEXT_CONFIG = {
  kind: 'text',
  tabLabel: 'Text',
  getTemplates: getTextTemplates,
  remove: deleteTextTemplate,
  serialize: serializeTextTemplateForShare,
}

function OutreachTabs({ activeTab, onChange }) {
  return (
    <div className="flex gap-4" role="tablist" aria-label="Outreach template type">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'pb-1.5 text-sm font-medium border-b-2 transition-opacity',
              isActive ? 'opacity-100 border-white/70' : 'opacity-50 border-transparent hover:opacity-80'
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function ShareOutreachDialog({ open, onOpenChange, template, serialize, tabLabel }) {
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  if (!open || !template) return null
  const payload = serialize(template)

  const copyPayload = async () => {
    try {
      await navigator.clipboard.writeText(payload)
      showToast('Template copied to clipboard', 'success')
    } catch {
      showToast('Could not copy to clipboard', 'error')
    }
  }

  const nativeShare = async () => {
    try {
      await navigator.share({
        title: `Outreach: ${template.name || 'Template'}`,
        text: payload,
      })
      showToast('Shared', 'success')
      onOpenChange(false)
    } catch (e) {
      if (e?.name === 'AbortError') return
      await copyPayload()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="map-panel list-panel max-w-md p-0" showCloseButton nestedOverlay topLayer>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/20 text-left">
          <PanelHeader onBack={() => onOpenChange(false)} title="Share template" />
          <DialogDescription className="sr-only">Share outreach template JSON</DialogDescription>
          <p className="text-sm text-white/70 mt-2">
            Copy the template data or share it with a teammate.
          </p>
        </DialogHeader>
        <div className="px-6 py-4 flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={copyPayload} className="create-list-btn flex-1">
            <Download className="h-4 w-4 mr-2" />
            Copy to clipboard
          </Button>
          {canNativeShare && (
            <Button type="button" variant="outline" onClick={nativeShare} className="create-list-btn flex-1">
              <Share2 className="h-4 w-4 mr-2" />
              Share…
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TemplateListRow({ template, kind, onOpen, onMenu }) {
  return (
    <div className="relative">
      <button type="button" className={cn(LIST_ROW_CLASS, 'pr-12 w-full')} onClick={onOpen}>
        <div className="text-sm font-medium truncate">{template.name}</div>
        {kind === 'email' && (
          <div className="text-xs opacity-60 truncate">
            {template.subject?.trim() ? template.subject : '(no subject)'}
          </div>
        )}
        <div className="text-xs opacity-50 line-clamp-2 mt-0.5">{template.body?.trim() || '(no body)'}</div>
      </button>
      <div className="absolute right-1.5 top-1.5 z-10">
        <PanelOptionsButton
          title="Template options"
          onClick={(e) => {
            e.stopPropagation()
            onMenu(e)
          }}
        />
      </div>
    </div>
  )
}

function TemplateDetail({ template, kind, onEdit }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/15 bg-white/[0.04] px-4 py-4 space-y-4">
        {kind === 'email' && (
          <div>
            <p className="text-xs font-semibold uppercase opacity-50 mb-1">Subject</p>
            <p className="text-sm">{template.subject?.trim() || '(no subject)'}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold uppercase opacity-50 mb-1">{kind === 'email' ? 'Body' : 'Message'}</p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{template.body?.trim() || '(no body)'}</p>
        </div>
      </div>
      <Button type="button" variant="outline" className="create-list-btn w-full" onClick={onEdit}>
        <Edit2 className="h-4 w-4 mr-2" />
        Edit template
      </Button>
    </div>
  )
}

function useTemplateTab(config) {
  const { scheduleSync } = useUserDataSync()
  const [templates, setTemplates] = useState([])
  const [screen, setScreen] = useState('list')
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuTemplate, setMenuTemplate] = useState(null)
  const menuTriggerRef = useRef(null)
  const [shareFor, setShareFor] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTemplate, setEditorTemplate] = useState(null)

  const reload = useCallback(() => setTemplates(config.getTemplates()), [config])

  useEffect(() => {
    reload()
  }, [reload])

  const goToList = useCallback(() => {
    setScreen('list')
    setSelected(null)
  }, [])

  const openCreate = useCallback(() => {
    setEditorTemplate(null)
    setEditorOpen(true)
  }, [])

  const openDetail = useCallback((item) => {
    setSelected(item)
    setScreen('detail')
  }, [])

  const openEdit = useCallback((item) => {
    setEditorTemplate(item)
    setEditorOpen(true)
  }, [])

  const openMenu = useCallback((item, e) => {
    menuTriggerRef.current = e.currentTarget
    setMenuTemplate(item)
    setMenuOpen(true)
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sorted = [...templates].sort(
      (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
    )
    if (!q) return sorted
    return sorted.filter((item) => {
      const hay = [item.name, item.subject, item.body].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [templates, search])

  const handleDelete = async (id) => {
    if (!(await showConfirm('Delete this template?', 'Delete template'))) return
    config.remove(id)
    scheduleSync()
    reload()
    if (selected?.id === id) goToList()
    showToast('Template deleted', 'success')
  }

  const handleEditorSaved = () => {
    reload()
    if (editorTemplate?.id && selected?.id === editorTemplate.id) {
      const fresh = config.getTemplates().find((t) => t.id === editorTemplate.id)
      if (fresh) setSelected(fresh)
    }
  }

  return {
    kind: config.kind,
    tabLabel: config.tabLabel,
    screen,
    selected,
    search,
    setSearch,
    filtered,
    menuOpen,
    setMenuOpen,
    menuTemplate,
    menuTriggerRef,
    shareFor,
    setShareFor,
    goToList,
    openCreate,
    openDetail,
    openEdit,
    openMenu,
    handleDelete,
    serialize: config.serialize,
    editorOpen,
    setEditorOpen,
    editorTemplate,
    handleEditorSaved,
  }
}

const TemplateTabPane = forwardRef(function TemplateTabPane(
  { tab, onUseTemplate, searchQuery, onNavChange },
  ref
) {
  const config = tab === 'email' ? EMAIL_CONFIG : TEXT_CONFIG
  const t = useTemplateTab(config)
  const {
    kind,
    tabLabel,
    screen,
    selected,
    filtered,
    menuOpen,
    setMenuOpen,
    menuTemplate,
    menuTriggerRef,
    shareFor,
    setShareFor,
    goToList,
    openCreate,
    openDetail,
    openEdit,
    openMenu,
    handleDelete,
    serialize,
    setSearch,
    editorOpen,
    setEditorOpen,
    editorTemplate,
    handleEditorSaved,
  } = t

  useImperativeHandle(ref, () => ({ goToList }))

  useEffect(() => {
    setSearch(searchQuery)
  }, [searchQuery, setSearch])

  useEffect(() => {
    onNavChange({
      screen,
      title: screen === 'list' ? null : selected?.name || 'Template',
      onCreate: openCreate,
      onDetailOptions: (e) => openMenu(selected, e),
    })
  }, [screen, selected, onNavChange, openCreate, openMenu])

  return (
    <>
      {screen === 'detail' && selected && (
        <TemplateDetail
          template={selected}
          kind={kind}
          onEdit={() => openEdit(selected)}
        />
      )}

      {screen === 'list' && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm opacity-60">
                {searchQuery.trim() ? 'No templates match your search.' : `No ${kind} templates yet.`}
              </p>
              {!searchQuery.trim() && (
                <>
                  <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">
                    Create a reusable {kind === 'email' ? 'email' : 'text'} template with merge tags for leads and parcels.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="create-list-btn mt-5 mx-auto"
                    onClick={openCreate}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create template
                  </Button>
                </>
              )}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((template) => (
                <li key={template.id}>
                  <TemplateListRow
                    template={template}
                    kind={kind}
                    onOpen={() => openDetail(template)}
                    onMenu={(e) => openMenu(template, e)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {editorOpen && (
        <Suspense fallback={null}>
          <OutreachTemplateEditorDialog
            open={editorOpen}
            onOpenChange={setEditorOpen}
            kind={kind}
            template={editorTemplate}
            onSaved={handleEditorSaved}
            nestedOverlay
            topLayer
          />
        </Suspense>
      )}

      <OptionsMenuDropdown
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorEl={menuTriggerRef.current}
        menuWidth={180}
      >
        {menuTemplate && (
          <>
            {onUseTemplate && tab === 'email' && (
              <OptionsMenuItem
                onClick={() => {
                  onUseTemplate(menuTemplate)
                  setMenuOpen(false)
                }}
              >
                <FileText className="h-4 w-4 shrink-0" />
                Use template
              </OptionsMenuItem>
            )}
            <OptionsMenuItem
              onClick={() => {
                openEdit(menuTemplate)
                setMenuOpen(false)
              }}
            >
              <Edit2 className="h-4 w-4 shrink-0" />
              Edit
            </OptionsMenuItem>
            <OptionsMenuItem
              onClick={() => {
                setShareFor(menuTemplate)
                setMenuOpen(false)
              }}
            >
              <Share2 className="h-4 w-4 shrink-0" />
              Share
            </OptionsMenuItem>
            <OptionsMenuItem destructive onClick={() => { handleDelete(menuTemplate.id); setMenuOpen(false) }}>
              <Trash2 className="h-4 w-4 shrink-0" />
              Delete
            </OptionsMenuItem>
          </>
        )}
      </OptionsMenuDropdown>

      <ShareOutreachDialog
        open={!!shareFor}
        onOpenChange={(v) => { if (!v) setShareFor(null) }}
        template={shareFor}
        serialize={serialize}
        tabLabel={tabLabel}
      />
    </>
  )
})

export function OutreachPanel({ isOpen, onClose, onUseTemplate, initialTab = 'email', panelDockSlot }) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const [searchQuery, setSearchQuery] = useState('')
  const [nav, setNav] = useState({ screen: 'list', title: null })
  const activeTabRef = useRef(null)

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab)
  }, [isOpen, initialTab])

  useEffect(() => {
    setNav({ screen: 'list', title: null })
    setSearchQuery('')
  }, [activeTab])

  const handleBack = () => {
    if (nav.screen !== 'list') {
      activeTabRef.current?.goToList?.()
      return
    }
    onClose()
  }

  const showListChrome = nav.screen === 'list'

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} modal={false} onOpenChange={ignoreRadixMapPanelDismiss}>
      <DialogContent
        className="map-panel list-panel outreach-panel fullscreen-panel flex flex-col min-h-0 p-0"
        panelDockSlot={panelDockSlot}
        showCloseButton={false}
        hideOverlay
        suppressBackdrop
      >
        <DialogHeader className={cn(PANEL_LIST_HEADER_CLASS, 'flex-shrink-0 pb-4')} style={PANEL_LIST_HEADER_STYLE}>
          <DialogDescription className="sr-only">Manage email and text outreach templates</DialogDescription>
          <PanelHeader
            onBack={handleBack}
            title={nav.title || 'Outreach'}
          >
            {showListChrome && (
              <PanelCreateButton title="New template" onClick={() => nav.onCreate?.()} />
            )}
            {nav.screen === 'detail' && (
              <PanelOptionsButton
                title="Template options"
                onClick={(e) => nav.onDetailOptions?.(e)}
              />
            )}
          </PanelHeader>
        </DialogHeader>

        <div
          className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-6 py-3"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {showListChrome && (
            <div className="mb-3 space-y-3">
              <OutreachTabs activeTab={activeTab} onChange={setActiveTab} />
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${activeTab} templates…`}
                  className="w-full text-sm rounded-lg pl-9 pr-3 py-2"
                  aria-label="Search templates"
                />
              </div>
            </div>
          )}
          <TemplateTabPane
            key={activeTab}
            ref={activeTabRef}
            tab={activeTab}
            onUseTemplate={onUseTemplate}
            searchQuery={searchQuery}
            onNavChange={setNav}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default OutreachPanel
