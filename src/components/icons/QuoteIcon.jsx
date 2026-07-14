import { cn } from '@/lib/utils'

/** Line-free paper document with a dollar sign — used for Quotes menu/panel. */
export function QuoteIcon({ className }) {
  return (
    <svg
      className={cn('quote-icon shrink-0', className ?? 'h-4 w-4')}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M14.5 11h-3a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-3" />
      <path d="M12 9.5v9" />
    </svg>
  )
}
