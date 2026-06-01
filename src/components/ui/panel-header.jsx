import { ArrowLeft } from 'lucide-react'
import { Button } from './button'
import { DialogTitle } from './dialog'
import { cn } from '@/lib/utils'

export function PanelBackButton({ onClick, title = 'Back', className }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('shrink-0', className)}
      onClick={onClick}
      title={title}
    >
      <ArrowLeft className="h-4 w-4" />
    </Button>
  )
}

/**
 * Standard map panel header: back arrow left of title, optional actions on the right.
 */
export function PanelHeader({
  onBack,
  backTitle = 'Back',
  title,
  subtitle,
  subtitleClassName,
  icon: Icon,
  titleClassName,
  toolbarClassName,
  backButtonClassName,
  children,
}) {
  const titleContent =
    typeof title === 'string' ? (
      Icon ? (
        <DialogTitle className={cn('text-xl font-semibold flex items-center gap-2 min-w-0 truncate', titleClassName)}>
          <Icon className="h-5 w-5 shrink-0" />
          <span className="truncate">{title}</span>
        </DialogTitle>
      ) : (
        <DialogTitle className={cn('text-xl font-semibold truncate', titleClassName)}>{title}</DialogTitle>
      )
    ) : (
      title
    )

  return (
    <div className={cn('map-panel-header-toolbar', toolbarClassName)}>
      <div className="map-panel-header-title-wrap flex min-w-0 items-center gap-3">
        <PanelBackButton onClick={onBack} title={backTitle} className={backButtonClassName} />
        <div className="min-w-0 flex-1">
          {titleContent}
          {subtitle ? <p className={cn('text-xs opacity-50 truncate mt-0.5', subtitleClassName)}>{subtitle}</p> : null}
        </div>
      </div>
      {children ? <div className="map-panel-header-actions gap-1">{children}</div> : null}
    </div>
  )
}
