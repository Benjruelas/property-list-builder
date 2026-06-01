import { ArrowLeft, Loader2, MoreVertical, Plus } from 'lucide-react'
import * as React from 'react'
import { Button } from './button'
import { DialogTitle } from './dialog'
import { cn } from '@/lib/utils'

/** Shared list-panel header chrome (Lists panel is the reference). */
export const PANEL_LIST_HEADER_CLASS = 'px-6 pt-6 pb-4 border-b border-white/20 text-left'
export const PANEL_LIST_HEADER_STYLE = { paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }

export function PanelCreateButton({
  onClick,
  title = 'Create',
  disabled = false,
  loading = false,
  className,
  iconColor,
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn('create-new-list-btn shrink-0', className)}
      title={title}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Plus className="h-4 w-4" style={iconColor ? { color: iconColor } : undefined} />
      )}
    </Button>
  )
}

export const PanelOptionsButton = React.forwardRef(function PanelOptionsButton(
  { onClick, title = 'Options', className },
  ref
) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8 shrink-0', className)}
      title={title}
      onClick={onClick}
    >
      <MoreVertical className="h-4 w-4" />
    </Button>
  )
})

export function PanelBackButton({ onClick, title = 'Back', className }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8 shrink-0', className)}
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
