import { useState, useEffect } from 'react'
import { X, Phone, MessageSquare } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { getTextTemplates } from '@/utils/textTemplates'
import { replaceTemplateTags } from '@/utils/emailTemplates'

const normalizePhone = (p) => (p || '').replace(/[^\d+]/g, '')

export function PhoneActionPanel({ isOpen, onClose, phone, parcelData }) {
  const [step, setStep] = useState(1) // 1: Text/Call, 2: Template selection (only for Text)
  const [templates, setTemplates] = useState([])

  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setTemplates(getTextTemplates())
    }
  }, [isOpen])

  const handleCall = () => {
    const tel = normalizePhone(phone)
    if (tel) {
      window.location.href = `tel:${tel}`
    }
    onClose()
  }

  const handleText = (body = '') => {
    const tel = normalizePhone(phone)
    if (!tel) return
    const url = body
      ? `sms:${tel}?body=${encodeURIComponent(body)}`
      : `sms:${tel}`
    window.location.href = url
    onClose()
  }

  const handleSelectTemplate = (template) => {
    const body = parcelData ? replaceTemplateTags(template?.body || '', parcelData) : (template?.body || '')
    handleText(body)
  }

  const handleNoTemplate = () => {
    handleText('')
  }

  if (!phone) return null

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="map-panel phone-action-panel w-full max-w-[320px] rounded-2xl p-0 overflow-hidden" showCloseButton={false} blurOverlay>
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <div className="map-panel-header-toolbar">
            <DialogTitle className="map-panel-header-title-wrap text-lg font-semibold flex items-center gap-2 min-w-0 truncate">
              <Phone className="h-5 w-5 shrink-0" />
              <span className="truncate">{phone}</span>
            </DialogTitle>
            <div className="map-panel-header-actions">
              <Button variant="ghost" size="icon" className="phone-action-nav-btn" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Choose to text or call this number
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4 space-y-3">
          {step === 1 ? (
            <>
              <p className="text-sm text-gray-600">What would you like to do?</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setStep(2)
                  }}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Text
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleCall}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Call
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="phone-action-nav-btn text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back
                </button>
              </div>
              <p className="text-sm text-gray-600">Use a template or start with a blank message?</p>
              <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden scrollbar-hide min-h-0">
                <Button
                  variant="outline"
                  className="w-full justify-start text-left min-w-0"
                  onClick={handleNoTemplate}
                >
                  No template
                </Button>
                {templates.map((t) => (
                  <Button
                    key={t.id}
                    variant="outline"
                    className="w-full justify-start text-left min-w-0 h-auto py-2 whitespace-normal break-words"
                    onClick={() => handleSelectTemplate(t)}
                  >
                    {t.name}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
