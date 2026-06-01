import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Paper document with a dollar sign — used for Quotes menu/panel. */
export function QuoteIcon({ className }) {
  return (
    <span className={cn('relative inline-flex shrink-0 h-4 w-4', className)}>
      <FileText className="h-full w-full" strokeWidth={2} aria-hidden />
      <span
        className="absolute inset-0 flex items-center justify-center text-[9px] font-bold leading-none translate-y-px pointer-events-none"
        aria-hidden
      >
        $
      </span>
    </span>
  )
}
