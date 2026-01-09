import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog'
import { Button } from './button'

let confirmQueue = []
let confirmListeners = new Set()

const processQueue = () => {
  confirmListeners.forEach(listener => listener())
}

export const showConfirm = (message, title = 'Confirm') => {
  return new Promise((resolve) => {
    confirmQueue.push({ message, title, resolve })
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
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            {currentConfirm.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-700 py-4">{currentConfirm.message}</p>
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

