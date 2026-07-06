import { useState, useEffect } from 'react'
import { Mail } from 'lucide-react'
import { PanelHeader } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from './ui/dialog'
import { getEmailTemplates } from '@/utils/emailTemplates'

export function EmailActionPanel({
  isOpen,
  onClose,
  email,
  parcelData,
  onSelectTemplate,
  onNoTemplate,
}) {
  const [templates, setTemplates] = useState([])

  useEffect(() => {
    if (isOpen) {
      setTemplates(getEmailTemplates())
    }
  }, [isOpen])

  if (!email) return null

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="map-panel phone-action-panel w-full max-w-[320px] rounded-2xl p-0 overflow-hidden" showCloseButton={false} blurOverlay topLayer>
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <PanelHeader onBack={onClose} title={email} icon={Mail} titleClassName="text-lg font-semibold" />
          <DialogDescription className="sr-only">
            Choose an email template or start with a blank message
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4 space-y-3">
          <p className="text-sm text-gray-600">Use a template or start with a blank message?</p>
          <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden scrollbar-hide min-h-0">
            <Button
              variant="outline"
              className="w-full justify-start text-left min-w-0"
              onClick={() => onNoTemplate?.()}
            >
              No template
            </Button>
            {templates.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                className="w-full justify-start text-left min-w-0 h-auto py-2 whitespace-normal break-words"
                onClick={() => onSelectTemplate?.(t)}
              >
                {t.name}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
