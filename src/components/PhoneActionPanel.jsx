import { useState, useEffect } from 'react'
import { Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCachedOutreachTemplates, fetchOutreachTemplates } from '@/utils/outreachTemplates'
import { normalizePhoneForTel } from '@/utils/phoneFormat'
import {
  DealTemplatePanelShell,
  DealTemplatePanelScroll,
  DEAL_TEMPLATE_LIST_ROW,
  CONTACT_ACTION_PANEL_CLASS,
  ContactActionPanelFooter,
  DEAL_TEMPLATE_SAFE_BODY_STYLE,
} from './dealTemplates/dealTemplatePanelShared'

const STEP_MENU = 1
const STEP_TEXT_TEMPLATES = 2
const STEP_CALL_CONFIRM = 3

function CallConfirmActions({ onNo, onYes }) {
  return (
    <div
      className="flex gap-2 px-4 py-3 flex-shrink-0"
      style={DEAL_TEMPLATE_SAFE_BODY_STYLE}
    >
      <button
        type="button"
        onClick={onNo}
        className={cn(
          DEAL_TEMPLATE_LIST_ROW,
          'flex-1 flex flex-row items-center justify-center cursor-pointer py-6 text-lg font-semibold min-h-[4.5rem]',
        )}
      >
        No
      </button>
      <button
        type="button"
        onClick={onYes}
        className={cn(
          DEAL_TEMPLATE_LIST_ROW,
          'flex-1 flex flex-row items-center justify-center cursor-pointer py-6 text-lg font-semibold min-h-[4.5rem] border-white/20 bg-white/[0.06]',
        )}
      >
        Yes
      </button>
    </div>
  )
}

export function PhoneActionPanel({
  isOpen,
  onClose,
  phone,
  parcelData,
  leadId = null,
  onOutreach,
  /** Open send-style compose with a text template (or blank). */
  onComposeText,
  initialStep = 1,
  getToken = null,
  nestedOverlay = true,
}) {
  const [step, setStep] = useState(STEP_MENU)
  const [templates, setTemplates] = useState([])
  const openedDirectToCallConfirm = initialStep === STEP_CALL_CONFIRM

  useEffect(() => {
    if (isOpen) {
      if (initialStep === STEP_TEXT_TEMPLATES) setStep(STEP_TEXT_TEMPLATES)
      else if (initialStep === STEP_CALL_CONFIRM) setStep(STEP_CALL_CONFIRM)
      else setStep(STEP_MENU)
      let cancelled = false
      const load = async () => {
        if (getToken) {
          try {
            const list = await fetchOutreachTemplates(getToken, 'text')
            if (!cancelled) setTemplates(list)
            return
          } catch {
            /* cache fallback */
          }
        }
        if (!cancelled) setTemplates(getCachedOutreachTemplates('text'))
      }
      load()
      return () => {
        cancelled = true
      }
    }
  }, [isOpen, initialStep, getToken])

  const handleCall = () => {
    const tel = normalizePhoneForTel(phone)
    if (tel) {
      if (leadId && onOutreach) onOutreach('call')
      window.location.href = `tel:${tel}`
    }
    onClose()
  }

  const openTextCompose = (template = null) => {
    if (typeof onComposeText === 'function') {
      onComposeText({
        template,
        phone,
        parcelData,
        leadId,
      })
      return
    }
    // Fallback: open blank SMS if compose handler missing
    const tel = normalizePhoneForTel(phone)
    if (tel) {
      if (leadId && onOutreach) onOutreach('text')
      window.location.href = `sms:${tel}`
    }
    onClose()
  }

  const exitCallConfirm = () => {
    if (openedDirectToCallConfirm) {
      onClose()
      return
    }
    setStep(STEP_MENU)
  }

  const handleBack = () => {
    if (step === STEP_TEXT_TEMPLATES && initialStep !== STEP_TEXT_TEMPLATES) {
      setStep(STEP_MENU)
      return
    }
    if (step === STEP_CALL_CONFIRM) {
      exitCallConfirm()
      return
    }
    onClose()
  }

  if (!phone) return null

  const callConfirmTitle = `Call ${phone}?`
  const isCallConfirm = step === STEP_CALL_CONFIRM

  const panelDescription = isCallConfirm
    ? callConfirmTitle
    : step === STEP_MENU
      ? 'Choose to text or call this number'
      : 'Choose a text template or start with a blank message'

  const panelTitle = isCallConfirm ? callConfirmTitle : phone

  const panelFooter = isCallConfirm ? null : <ContactActionPanelFooter onCancel={onClose} />

  return (
    <DealTemplatePanelShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      onBack={handleBack}
      showBack={!isCallConfirm}
      titleCentered={isCallConfirm}
      title={panelTitle}
      icon={isCallConfirm ? undefined : Phone}
      description={panelDescription}
      nestedOverlay={nestedOverlay}
      panelClassName={cn(CONTACT_ACTION_PANEL_CLASS, isCallConfirm && 'call-confirm-panel')}
      footer={panelFooter}
    >
      {isCallConfirm ? (
        <CallConfirmActions onNo={exitCallConfirm} onYes={handleCall} />
      ) : (
        <DealTemplatePanelScroll className="compact-picker-scroll space-y-1.5">
          {step === STEP_MENU ? (
            <>
              <button
                type="button"
                onClick={() => setStep(STEP_TEXT_TEMPLATES)}
                className={cn(DEAL_TEMPLATE_LIST_ROW, 'w-full text-left cursor-pointer')}
              >
                <div className="text-sm font-medium">Text</div>
              </button>
              <button
                type="button"
                onClick={() => setStep(STEP_CALL_CONFIRM)}
                className={cn(DEAL_TEMPLATE_LIST_ROW, 'w-full text-left cursor-pointer')}
              >
                <div className="text-sm font-medium">Call</div>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openTextCompose(null)}
                className={cn(DEAL_TEMPLATE_LIST_ROW, 'w-full text-left cursor-pointer border-white/20 bg-white/[0.06]')}
              >
                <div className="text-sm font-medium">No template</div>
              </button>
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openTextCompose(t)}
                  className={cn(DEAL_TEMPLATE_LIST_ROW, 'w-full text-left cursor-pointer')}
                >
                  <div className="text-sm font-medium truncate">{t.name}</div>
                </button>
              ))}
            </>
          )}
        </DealTemplatePanelScroll>
      )}
    </DealTemplatePanelShell>
  )
}
