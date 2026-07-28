import { useEffect, useState } from 'react'
import { Briefcase, MoreVertical, Plus } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import {
  getDealTemplates,
  fetchDealTemplates,
  deleteDealTemplateApi,
  dealTemplateSummary,
} from '@/utils/dealTemplates'
import { showConfirm } from './ui/confirm-dialog'
import { showToast } from './ui/toast'
import {
  DealTemplatePanelShell,
  DealTemplatePanelScroll,
  DealTemplateEmptyState,
  DealTemplateRowMenu,
  useDealTemplateRowMenu,
  DEAL_TEMPLATE_LIST_ROW,
} from './dealTemplates/dealTemplatePanelShared'

export function DealTemplatesManagerDialog({
  open,
  onOpenChange,
  onCreateTemplate,
  onEditTemplate,
  getToken,
  nestedOverlay = true,
  refreshKey = 0,
}) {
  const [templates, setTemplates] = useState([])
  const { openId, menuAnchor, openMenu, closeMenu } = useDealTemplateRowMenu(open)

  const reload = () => setTemplates(getDealTemplates())

  useEffect(() => {
    if (!open) return
    if (!getToken) {
      reload()
      return
    }
    fetchDealTemplates(getToken)
      .then(setTemplates)
      .catch(() => reload())
  }, [open, refreshKey, getToken])

  const handleDelete = async (id) => {
    if (!await showConfirm('Delete this deal template?', 'Delete template')) return
    try {
      if (getToken) await deleteDealTemplateApi(getToken, id)
      else setTemplates((prev) => prev.filter((t) => t.id !== id))
      reload()
      showToast('Template deleted', 'success')
    } catch (err) {
      showToast(err.message || 'Could not delete template', 'error')
    }
  }

  const activeTemplate = openId ? templates.find((t) => t.id === openId) : null

  return (
    <>
      <DealTemplatePanelShell
        open={open}
        onOpenChange={onOpenChange}
        title="Deal templates"
        icon={Briefcase}
        listMode
        description="Manage deal templates"
        nestedOverlay={nestedOverlay}
        headerActions={
          <Button variant="default" size="sm" onClick={() => onCreateTemplate?.()}>
            <Plus className="h-4 w-4 mr-1" /> Create template
          </Button>
        }
      >
        <DealTemplatePanelScroll>
          {templates.length === 0 ? (
            <DealTemplateEmptyState
              icon={Briefcase}
              title="No deal templates yet."
              hint="Save default notes, finances, and tasks to speed up new deals."
              action={
                <Button variant="default" size="sm" className="mt-4" onClick={() => onCreateTemplate?.()}>
                  <Plus className="h-4 w-4 mr-1" /> Create template
                </Button>
              }
            />
          ) : (
            templates.map((t) => (
              <div
                key={t.id}
                className={cn(DEAL_TEMPLATE_LIST_ROW, 'relative pr-12 cursor-default')}
                role="presentation"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.name}</div>
                  <div className="text-xs opacity-60 truncate">{dealTemplateSummary(t)}</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 border border-white/20 rounded-md text-white/90 hover:bg-white/10"
                  title="Template options"
                  onClick={(e) => openMenu(t.id, e)}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </DealTemplatePanelScroll>
      </DealTemplatePanelShell>

      <DealTemplateRowMenu
        openId={openId}
        menuAnchor={menuAnchor}
        onClose={closeMenu}
        onEdit={() => activeTemplate && onEditTemplate?.(activeTemplate.id)}
        onDelete={() => activeTemplate && handleDelete(activeTemplate.id)}
      />
    </>
  )
}

export default DealTemplatesManagerDialog
