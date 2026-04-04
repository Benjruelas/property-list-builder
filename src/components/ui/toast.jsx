import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

let toastId = 0
const toastListeners = new Set()

export const showToast = (message, type = 'info', duration = 3000) => {
  const id = toastId++
  const toast = { id, message, type, duration }
  toastListeners.forEach(listener => listener(toast))
  return id
}

export const ToastContainer = () => {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const listener = (toast) => {
      setToasts(prev => [...prev, toast])
      if (toast.duration > 0) {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toast.id))
        }, toast.duration)
      }
    }
    toastListeners.add(listener)
    return () => {
      toastListeners.delete(listener)
    }
  }, [])

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const content = (
    <div className="fixed left-1/2 -translate-x-1/2 z-[99999] flex flex-col gap-2 items-center pointer-events-none [&>*]:pointer-events-auto" style={{ top: 'calc(12px + env(safe-area-inset-top, 0px))' }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            "map-panel flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg min-w-[300px] max-w-md animate-in slide-in-from-top-5",
            toast.type === 'success' && "border-green-300/50",
            toast.type === 'error' && "border-red-300/50",
            toast.type === 'info' && "border-blue-300/50",
            toast.type === 'warning' && "border-amber-300/50"
          )}
        >
          {toast.type === 'success' && <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600" />}
          {toast.type === 'error' && <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />}
          {(toast.type === 'info' || toast.type === 'warning') && <Info className="h-5 w-5 flex-shrink-0 text-blue-600" />}
          <span className="flex-1 text-sm font-medium text-gray-900">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )

  return typeof document !== 'undefined'
    ? createPortal(content, document.getElementById('modal-root') || document.body)
    : content
}

