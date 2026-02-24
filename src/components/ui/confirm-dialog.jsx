import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog'
import { Button } from './button'

let confirmQueue = []
let confirmListeners = new Set()

const processQueue = () => {
  confirmListeners.forEach(listener => listener())
}

export const showConfirm = (message, title = 'Confirm', options = {}) => {
  return new Promise((resolve) => {
    confirmQueue.push({ message, title, resolve, ...options })
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
      <DialogContent className="map-panel confirm-dialog max-w-md" showCloseButton={false} focusOverlay>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            {currentConfirm.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {currentConfirm.message}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-gray-700 py-2">{currentConfirm.message}</p>
        {currentConfirm.detail && (
          <div className="mt-3 rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm text-white/95">
            {currentConfirm.detail}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

