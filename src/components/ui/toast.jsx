import { useState, useEffect } from 'react'
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

  return (
    <div className="fixed top-4 right-4 z-[3000] flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[300px] max-w-md animate-in slide-in-from-top-5",
            toast.type === 'success' && "bg-green-50 border border-green-200 text-green-900",
            toast.type === 'error' && "bg-red-50 border border-red-200 text-red-900",
            toast.type === 'info' && "bg-blue-50 border border-blue-200 text-blue-900",
            toast.type === 'warning' && "bg-yellow-50 border border-yellow-200 text-yellow-900"
          )}
        >
          {toast.type === 'success' && <CheckCircle className="h-5 w-5 flex-shrink-0" />}
          {toast.type === 'error' && <AlertCircle className="h-5 w-5 flex-shrink-0" />}
          {(toast.type === 'info' || toast.type === 'warning') && <Info className="h-5 w-5 flex-shrink-0" />}
          <span className="flex-1 text-sm font-medium">{toast.message}</span>
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
}

