import { Eye, EyeOff } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

export function CompletedTasksToggleButton({
  showCompleted,
  onToggle,
  variant = 'outline',
  className,
  iconClassName = 'h-3.5 w-3.5',
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={variant}
      className={cn('h-7 w-7', className)}
      onClick={onToggle}
      title={showCompleted ? 'Hide completed tasks' : 'View completed tasks'}
      aria-pressed={showCompleted}
    >
      {showCompleted ? (
        <EyeOff className={iconClassName} />
      ) : (
        <Eye className={iconClassName} />
      )}
    </Button>
  )
}
