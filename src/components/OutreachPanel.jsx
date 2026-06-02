import { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import {
  Trash2,
  Share2,
  Download,
  Search,
  Edit2,
  FileText,
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
import { Input } from './ui/input'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import {
  getEmailTemplates,
  addEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  AVAILABLE_TAGS,
  serializeEmailTemplateForShare,
} from '../utils/emailTemplates'
import {
  getTextTemplates,
  addTextTemplate,
  updateTextTemplate,
  deleteTextTemplate,
  serializeTextTemplateForShare,
} from '../utils/textTemplates'
import { useUserDataSync } from '@/contexts/UserDataSyncContext'

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
  add: addEmailTemplate,
  update: updateEmailTemplate,
  remove: deleteEmailTemplate,
  serialize: serializeEmailTemplateForShare,
}

const TEXT_CONFIG = {
  kind: 'text',
  tabLabel: 'Text',
  getTemplates: getTextTemplates,
  add: addTextTemplate,
  update: updateTextTemplate,
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

function TagBar({ onInsertTag }) {
  return (
    <div className="mb-2">
      <p className="text-xs mb-2 opacity-60">Insert tag</p>
      <div className="flex flex-wrap gap-1.5">
        {AVAILABLE_TAGS.map((tag) => (
          <Button
            key={tag}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs create-list-btn px-2"
            onMouseDown={(e) => {
              e.preventDefault()
              onInsertTag(tag)
            }}
          >
            {tag}
          </Button>
        ))}
      </div>
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

function TemplateDetail({ template, kind }) {
  return (
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
  )
}

function TemplateEditor({
  kind,
  templateName,
  setTemplateName,
  templateSubject,
  setTemplateSubject,
  templateBody,
  setTemplateBody,
  focusedField,
  setFocusedField,
  onSave,
  onCancel,
  isEdit,
  hasChanges,
}) {
  const blurHandler = () => {
    setTimeout(() => {
      const el = document.activeElement
      if (el?.tagName !== 'TEXTAREA' && el?.tagName !== 'INPUT') setFocusedField(null)
    }, 200)
  }

  const insertTag = (tag) => {
    const token = `{${tag}}`
    if (kind === 'email' && focusedField === 'subject') setTemplateSubject((p) => p + token)
    else setTemplateBody((p) => p + token)
  }

  return (
    <div className="space-y-3 create-list-form">
      <div>
        <label className="text-xs font-medium block mb-1 opacity-90">
          Name <span className="text-red-400">*</span>
        </label>
        <Input
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder={kind === 'email' ? 'e.g. Initial contact' : 'e.g. Follow-up text'}
          className="text-sm"
          autoFocus
        />
      </div>
      {kind === 'email' && (
        <div>
          <label className="text-xs font-medium block mb-1 opacity-90">Subject</label>
          {focusedField === 'subject' && <TagBar onInsertTag={insertTag} />}
          <Input
            value={templateSubject}
            onChange={(e) => setTemplateSubject(e.target.value)}
            onFocus={() => setFocusedField('subject')}
            onBlur={blurHandler}
            placeholder="Email subject line"
            className="text-sm"
          />
        </div>
      )}
      <div>
        <label className="text-xs font-medium block mb-1 opacity-90">{kind === 'email' ? 'Body' : 'Message'}</label>
        {focusedField === 'body' && <TagBar onInsertTag={insertTag} />}
        <textarea
          value={templateBody}
          onChange={(e) => setTemplateBody(e.target.value)}
          onFocus={() => setFocusedField('body')}
          onBlur={blurHandler}
          placeholder="Use {Owner Name}, {Address}, and other tags for dynamic fields."
          className="w-full min-h-[200px] p-3 text-sm rounded-lg border border-white/15 bg-white/[0.04] resize-y scrollbar-hide focus:outline-none focus:ring-2 focus:ring-white/25"
          rows={8}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          className="create-list-btn flex-1"
          onClick={onSave}
          disabled={isEdit && !hasChanges}
        >
          {isEdit ? 'Save' : 'Create'}
        </Button>
        <Button variant="outline" className="create-list-btn flex-1" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function useTemplateTab(config) {
  const { scheduleSync } = useUserDataSync()
  const [templates, setTemplates] = useState([])
  const [screen, setScreen] = useState('list')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [templateName, setTemplateName] = useState('')
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [focusedField, setFocusedField] = useState(null)
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuTemplate, setMenuTemplate] = useState(null)
  const menuTriggerRef = useRef(null)
  const [shareFor, setShareFor] = useState(null)

  const reload = useCallback(() => setTemplates(config.getTemplates()), [config])

  useEffect(() => {
    reload()
  }, [reload])

  const resetForm = useCallback(() => {
    setTemplateName('')
    setTemplateSubject('')
    setTemplateBody('')
    setFocusedField(null)
    setEditing(null)
  }, [])

  const goToList = useCallback(() => {
    setScreen('list')
    setSelected(null)
    resetForm()
  }, [resetForm])

  const openCreate = useCallback(() => {
    resetForm()
    setScreen('form')
  }, [resetForm])

  const openDetail = useCallback((item) => {
    setSelected(item)
    setScreen('detail')
  }, [])

  const openEdit = useCallback((item) => {
    setEditing(item)
    setTemplateName(item.name || '')
    setTemplateSubject(item.subject ?? '')
    setTemplateBody(item.body ?? '')
    setScreen('form')
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

  const hasChanges = editing
    ? templateName.trim() !== (editing.name || '').trim() ||
      templateSubject !== (editing.subject ?? '') ||
      templateBody !== (editing.body ?? '')
    : false

  const handleSave = () => {
    if (!templateName.trim()) {
      showToast('Enter a template name', 'error')
      return
    }
    const payload = {
      name: templateName.trim(),
      body: templateBody,
      ...(config.kind === 'email' ? { subject: templateSubject } : {}),
    }
    if (editing) config.update(editing.id, payload)
    else config.add(payload)
    scheduleSync()
    reload()
    goToList()
    showToast(editing ? 'Template updated' : 'Template created', 'success')
  }

  const handleDelete = async (id) => {
    if (!(await showConfirm('Delete this template?', 'Delete template'))) return
    config.remove(id)
    scheduleSync()
    reload()
    if (selected?.id === id) goToList()
    showToast('Template deleted', 'success')
  }

  return {
    kind: config.kind,
    tabLabel: config.tabLabel,
    screen,
    selected,
    editing,
    templateName,
    setTemplateName,
    templateSubject,
    setTemplateSubject,
    templateBody,
    setTemplateBody,
    focusedField,
    setFocusedField,
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
    handleSave,
    handleDelete,
    hasChanges,
    serialize: config.serialize,
  }
}

const TemplateTabPane = forwardRef(function TemplateTabPane(
  { tab, isActive, onUseTemplate, searchQuery, onNavChange },
  ref
) {
  const config = tab === 'email' ? EMAIL_CONFIG : TEXT_CONFIG
  const t = useTemplateTab(config)
  const {
    kind,
    tabLabel,
    screen,
    selected,
    editing,
    templateName,
    setTemplateName,
    templateSubject,
    setTemplateSubject,
    templateBody,
    setTemplateBody,
    focusedField,
    setFocusedField,
    filtered,
    search,
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
    handleSave,
    handleDelete,
    hasChanges,
    serialize,
    setSearch,
  } = t

  useImperativeHandle(ref, () => ({ goToList }))

  useEffect(() => {
    if (isActive) setSearch(searchQuery)
  }, [isActive, searchQuery, setSearch])

  useEffect(() => {
    if (!isActive) return
    onNavChange({
      screen,
      title:
        screen === 'list'
          ? null
          : screen === 'detail'
            ? selected?.name || 'Template'
            : editing
              ? 'Edit template'
              : 'New template',
      onCreate: openCreate,
      onDetailOptions: (e) => openMenu(selected, e),
    })
  }, [isActive, screen, selected, editing, onNavChange, openCreate, openMenu])

  if (!isActive) return null

  const handleOpen = (template) => {
    openDetail(template)
  }

  return (
    <>
      {screen === 'form' && (
        <TemplateEditor
          kind={kind}
          templateName={templateName}
          setTemplateName={setTemplateName}
          templateSubject={templateSubject}
          setTemplateSubject={setTemplateSubject}
          templateBody={templateBody}
          setTemplateBody={setTemplateBody}
          focusedField={focusedField}
          setFocusedField={setFocusedField}
          onSave={handleSave}
          onCancel={() => {
            if (editing) openDetail(editing)
            else goToList()
          }}
          isEdit={!!editing}
          hasChanges={hasChanges}
        />
      )}

      {screen === 'detail' && selected && <TemplateDetail template={selected} kind={kind} />}

      {screen === 'list' && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm opacity-60">
                {search.trim() ? 'No templates match your search.' : `No ${kind} templates yet.`}
              </p>
              {!search.trim() && (
                <p className="text-xs opacity-40 mt-1 max-w-xs mx-auto">
                  Create your first template to get started.
                </p>
              )}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((template) => (
                <li key={template.id}>
                  <TemplateListRow
                    template={template}
                    kind={kind}
                    onOpen={() => handleOpen(template)}
                    onMenu={(e) => openMenu(template, e)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
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

export function OutreachPanel({ isOpen, onClose, onUseTemplate, initialTab = 'email' }) {
  const [activeTab, setActiveTab] = useState(initialTab)
  const [searchQuery, setSearchQuery] = useState('')
  const [nav, setNav] = useState({ screen: 'list', title: null })
  const emailTabRef = useRef(null)
  const textTabRef = useRef(null)

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab)
  }, [isOpen, initialTab])

  useEffect(() => {
    setNav({ screen: 'list', title: null })
    setSearchQuery('')
  }, [activeTab])

  const handleBack = () => {
    if (nav.screen !== 'list') {
      const ref = activeTab === 'email' ? emailTabRef : textTabRef
      ref.current?.goToList?.()
      return
    }
    onClose()
  }

  const showListChrome = nav.screen === 'list'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="map-panel list-panel outreach-panel fullscreen-panel flex flex-col min-h-0 p-0"
        showCloseButton={false}
        hideOverlay
        topLayer
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
            ref={emailTabRef}
            tab="email"
            isActive={activeTab === 'email'}
            onUseTemplate={onUseTemplate}
            searchQuery={searchQuery}
            onNavChange={setNav}
          />
          <TemplateTabPane
            ref={textTabRef}
            tab="text"
            isActive={activeTab === 'text'}
            searchQuery={searchQuery}
            onNavChange={setNav}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default OutreachPanel
