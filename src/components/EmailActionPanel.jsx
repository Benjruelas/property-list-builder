import { useState, useEffect } from 'react'
import { Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getEmailTemplates } from '@/utils/emailTemplates'
import {
  DealTemplatePanelShell,
  DealTemplatePanelScroll,
  DEAL_TEMPLATE_LIST_ROW,
  CONTACT_ACTION_PANEL_CLASS,
  ContactActionPanelFooter,
} from './dealTemplates/dealTemplatePanelShared'

export function EmailActionPanel({
  isOpen,
  onClose,
  email,
  onSelectTemplate,
  onNoTemplate,
  nestedOverlay = true,
}) {
  const [templates, setTemplates] = useState([])

  useEffect(() => {
    if (isOpen) {
      setTemplates(getEmailTemplates())
    }
  }, [isOpen])

  if (!email) return null

  const handleNoTemplate = () => {
    onNoTemplate?.()
  }

  const handlePick = (template) => {
    onSelectTemplate?.(template)
  }

  return (
    <DealTemplatePanelShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose?.()
      }}
      title={email}
      icon={Mail}
      description="Choose an email template or start with a blank message"
      nestedOverlay={nestedOverlay}
      panelClassName={CONTACT_ACTION_PANEL_CLASS}
      footer={<ContactActionPanelFooter onCancel={onClose} />}
    >
      <DealTemplatePanelScroll className="compact-picker-scroll space-y-1.5">
        <button
          type="button"
          onClick={handleNoTemplate}
          className={cn(DEAL_TEMPLATE_LIST_ROW, 'w-full text-left cursor-pointer border-white/20 bg-white/[0.06]')}
        >
          <div className="text-sm font-medium">No template</div>
        </button>

        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handlePick(t)}
            className={cn(DEAL_TEMPLATE_LIST_ROW, 'w-full text-left cursor-pointer')}
          >
            <div className="text-sm font-medium truncate">{t.name}</div>
          </button>
        ))}
      </DealTemplatePanelScroll>
    </DealTemplatePanelShell>
  )
}
