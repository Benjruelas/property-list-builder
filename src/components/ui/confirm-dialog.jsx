import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './dialog'
import { Button } from './button'
import { cn } from '@/lib/utils'

let confirmQueue = []
let confirmListeners = new Set()

const processQueue = () => {
  confirmListeners.forEach(listener => listener())
}

export const showConfirm = (messageOrObj, title = 'Confirm', options = {}) => {
  return new Promise((resolve) => {
    if (typeof messageOrObj === 'object' && messageOrObj !== null) {
      const { message, description, title: t, onConfirm, destructive, variant, ...rest } = messageOrObj
      confirmQueue.push({
        message: message ?? description ?? null,
        title: t || 'Confirm',
        destructive: destructive || variant === 'danger',
        resolve: onConfirm ? (v) => { if (v) onConfirm(); resolve(v) } : resolve,
        ...rest,
      })
    } else {
      confirmQueue.push({
        message: messageOrObj,
        title,
        resolve,
        destructive: options.destructive || options.variant === 'danger',
        ...options,
      })
    }
    processQueue()
  })
}

export const ConfirmDialog = () => {
  const [open, setOpen] = useState(false)
  const [currentConfirm, setCurrentConfirm] = useState(null)

  useEffect(() => {
    const listener = () => {
      if (confirmQueue.length > 0 && !currentConfirm) {
        const next = confirmQueue.shift()
        setCurrentConfirm(next)
        setOpen(true)
      }
    }
    confirmListeners.add(listener)
    listener() // Check immediately
    return () => {
      confirmListeners.delete(listener)
    }
  }, [currentConfirm])

  const handleConfirm = () => {
    if (currentConfirm) {
      currentConfirm.resolve(true)
    }
    setOpen(false)
    setCurrentConfirm(null)
    // Process next in queue
    setTimeout(() => {
      if (confirmQueue.length > 0) {
        const next = confirmQueue.shift()
        setCurrentConfirm(next)
        setOpen(true)
      }
    }, 100)
  }

  const handleCancel = () => {
    if (currentConfirm) {
      currentConfirm.resolve(false)
    }
    setOpen(false)
    setCurrentConfirm(null)
    // Process next in queue
    setTimeout(() => {
      if (confirmQueue.length > 0) {
        const next = confirmQueue.shift()
        setCurrentConfirm(next)
        setOpen(true)
      }
    }, 100)
  }

  if (!currentConfirm) return null

  const isDestructive = currentConfirm.destructive === true
  const bodyMessage = currentConfirm.message
  const useDetailTitle = !!currentConfirm.detailSubtitle
  const confirmLabel = currentConfirm.confirmLabel || currentConfirm.confirmText || 'Confirm'

  return (
    <Dialog open={open} modal onOpenChange={(isOpen) => {
      if (!isOpen) {
        handleCancel()
      }
    }}>
      <DialogContent
        className={cn(
          'map-panel confirm-dialog overflow-hidden rounded-2xl border border-white/15 p-0 gap-0',
          isDestructive && 'confirm-dialog--destructive',
        )}
        showCloseButton={false}
        focusOverlay
        topLayer
        confirmLayer
        data-confirm-dialog
      >
        <div className="confirm-dialog-body px-5 pt-6 pb-2 text-center">
          <DialogHeader className="items-center space-y-2 text-center sm:text-center">
            <DialogTitle className="text-base font-semibold leading-snug text-white/95">
              {useDetailTitle ? (currentConfirm.detail || currentConfirm.title) : currentConfirm.title}
            </DialogTitle>
            {useDetailTitle && currentConfirm.detailSubtitle ? (
              <DialogDescription className="whitespace-pre-line text-sm leading-relaxed text-white/60">
                {currentConfirm.detailSubtitle}
              </DialogDescription>
            ) : null}
            {!useDetailTitle && bodyMessage ? (
              <DialogDescription className="whitespace-pre-line text-sm leading-relaxed text-white/60">
                {bodyMessage}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {currentConfirm.detail && !useDetailTitle ? (
            <div className="confirm-dialog-detail mt-3 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-left text-sm leading-relaxed text-white/90">
              {currentConfirm.detail}
            </div>
          ) : null}
        </div>
        <div className="confirm-dialog-actions flex gap-2.5 px-5 pb-5 pt-2">
          <Button variant="outline" onClick={handleCancel} className="confirm-dialog-cancel min-w-0 flex-1">
            Cancel
          </Button>
          <Button
            variant={isDestructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            className={cn(
              'confirm-dialog-confirm min-w-0 flex-1',
              isDestructive && 'confirm-dialog-confirm--destructive',
            )}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

