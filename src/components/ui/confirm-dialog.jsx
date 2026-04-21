import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog'
import { Button } from './button'

let confirmQueue = []
let confirmListeners = new Set()

const processQueue = () => {
  confirmListeners.forEach(listener => listener())
}

export const showConfirm = (messageOrObj, title = 'Confirm', options = {}) => {
  return new Promise((resolve) => {
    if (typeof messageOrObj === 'object' && messageOrObj !== null) {
      const { message, title: t, onConfirm, ...rest } = messageOrObj
      confirmQueue.push({ message, title: t || 'Confirm', resolve: onConfirm ? (v) => { if (v) onConfirm(); resolve(v) } : resolve, ...rest })
    } else {
      confirmQueue.push({ message: messageOrObj, title, resolve, ...options })
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        handleCancel()
      }
    }}>
      <DialogContent className="map-panel confirm-dialog max-w-[320px] rounded-2xl" showCloseButton={false} focusOverlay>
        <DialogHeader>
          <DialogTitle>
            {currentConfirm.detailSubtitle
              ? (currentConfirm.detail || currentConfirm.title)
              : currentConfirm.title}
          </DialogTitle>
          {currentConfirm.detailSubtitle && (
            <DialogDescription className="text-xs opacity-70 mt-0.5">
              {currentConfirm.detailSubtitle}
            </DialogDescription>
          )}
          {!currentConfirm.detailSubtitle && (
            <DialogDescription className="sr-only">
              {currentConfirm.message}
            </DialogDescription>
          )}
        </DialogHeader>
        <p className="text-sm text-gray-700 py-2 text-center">{currentConfirm.message}</p>
        {currentConfirm.detail && !currentConfirm.detailSubtitle && (
          <div className="mt-3 rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm text-white/95">
            {currentConfirm.detail}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-3 pt-2">
          <Button variant="outline" onClick={handleCancel} className="confirm-dialog-cancel w-full sm:w-auto">
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} className="confirm-dialog-confirm w-full sm:w-auto">
            {currentConfirm.confirmLabel || currentConfirm.confirmText || 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

