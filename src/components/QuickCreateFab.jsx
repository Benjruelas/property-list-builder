import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, ListTodo, UserSearch, Briefcase, FileText } from 'lucide-react'
import { QuoteIcon } from './icons/QuoteIcon'
import { cn } from '@/lib/utils'

const CREATE_ITEMS = [
  { id: 'task', label: 'New Task', Icon: ListTodo, featureId: 'tasks' },
  { id: 'lead', label: 'New Lead', Icon: UserSearch, featureId: 'leads' },
  { id: 'deal', label: 'New Deal', Icon: Briefcase, featureId: 'deals' },
  { id: 'quote', label: 'New Quote', Icon: QuoteIcon, featureId: 'quotes' },
  { id: 'report', label: 'New Report', Icon: FileText, featureId: 'reports' },
]

/** Solid accent for the FAB disk (matches parcel boundary color). */
function normalizeAccent(hex) {
  if (typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/i.test(hex)) return hex
  return '#2563eb'
}

function CreateMenuButton({ Icon, label, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full text-left text-gray-900 flex items-center transition-colors hamburger-menu-btn"
    >
      <Icon className="flex-shrink-0" aria-hidden />
      <span className="flex-1">{label}</span>
    </button>
  )
}

/**
 * Speed-dial FAB above the action bar — quick create Task, Lead, Deal, Quote, Report.
 */
export function QuickCreateFab({
  open = false,
  onOpenChange,
  onCreateTask,
  onCreateLead,
  onCreateDeal,
  onCreateQuote,
  onCreateReport,
  canAccessFeature = () => true,
  accentColor = '#2563eb',
  actionBarMenuOpen = false,
}) {
  const handlers = {
    task: onCreateTask,
    lead: onCreateLead,
    deal: onCreateDeal,
    quote: onCreateQuote,
    report: onCreateReport,
  }

  const visibleItems = CREATE_ITEMS.filter(
    (item) => !item.featureId || canAccessFeature(item.featureId)
  )

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onOpenChange?.(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  const run = (id) => {
    onOpenChange?.(false)
    handlers[id]?.()
  }

  const fillColor = normalizeAccent(accentColor)

  const chrome = (
    <>
      {open && (
        <>
          <div
            className="quick-create-fab-menu-backdrop"
            onClick={() => onOpenChange?.(false)}
            aria-hidden="true"
          />
          <div className="quick-create-fab-menu map-panel hamburger-menu" role="menu" aria-label="Create">
            {visibleItems.map(({ id, label, Icon }) => (
              <CreateMenuButton
                key={id}
                Icon={Icon}
                label={label}
                onClick={() => run(id)}
              />
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        className={cn(
          'quick-create-fab-btn',
          open && 'is-open',
          actionBarMenuOpen && 'quick-create-fab-btn--hidden'
        )}
        style={{ '--quick-create-fab-accent': fillColor }}
        aria-label="Create"
        aria-expanded={open}
        aria-haspopup="menu"
        data-tour="quick-create-fab"
        onClick={() => onOpenChange?.(!open)}
      >
        <Plus className="quick-create-fab-icon" strokeWidth={2.75} aria-hidden />
      </button>
    </>
  )

  if (typeof document === 'undefined') return chrome
  return createPortal(chrome, document.getElementById('modal-root') || document.body)
}
