import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PipeStageHeader({ label, count, color, collapsed, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      title={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
      className={cn(
        'w-full px-2 py-2 border-b flex items-center gap-1.5 flex-shrink-0 text-left transition-colors',
        color || 'bg-white/[0.08] text-white border-white/15',
        collapsed && 'md:h-full md:flex-col md:justify-start md:py-3 md:border-b-0',
      )}
    >
      {collapsed ? (
        <ChevronRight className="h-4 w-4 flex-shrink-0" />
      ) : (
        <ChevronDown className="h-4 w-4 flex-shrink-0" />
      )}
      <span
        className={cn(
          'font-semibold text-sm flex-1 truncate',
          collapsed && 'md:flex-none md:[writing-mode:vertical-rl]',
        )}
      >
        {label}
      </span>
      <span className="text-xs opacity-70">{count}</span>
    </button>
  )
}
