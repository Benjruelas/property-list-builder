import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-app-dialog-backdrop
    className={cn(
      "fixed inset-0 z-[9998] bg-black/80 pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/** Map/fullscreen panels: fade only (zoom/slide fight fullscreen-panel transform overrides and cause flicker). */
const PANEL_CONTENT_MOTION =
  'map-panel-dialog pointer-events-auto duration-200 ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-150'
const PANEL_OVERLAY_MOTION =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-150 ease-out'
const DEFAULT_CONTENT_MOTION =
  'pointer-events-auto duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'

function isMapPanelClassName(className) {
  return typeof className === 'string' && /\bmap-panel\b/.test(className)
}

/** Prevents Radix Dialog from closing when the user interacts inside portaled UI (schedule picker, lead task/pipe menus, toasts). */
const preventCloseWhenNestedOverlay = (e, existing) => {
  if (
    e.target?.closest?.('.schedule-picker-panel') ||
    e.target?.closest?.('[data-task-menu]') ||
    e.target?.closest?.('[data-lead-details-menu]') ||
    e.target?.closest?.('[data-deal-details-menu]') ||
    e.target?.closest?.('[data-deal-line-items-menu]') ||
    e.target?.closest?.('[data-options-menu]') ||
    e.target?.closest?.('[data-confirm-dialog]') ||
    e.target?.closest?.('[data-send-quote-dialog]') ||
    e.target?.closest?.('[data-pipe-menu]') ||
    e.target?.closest?.('[data-deals-panel-menu]') ||
    e.target?.closest?.('[data-quotes-panel-menu]') ||
    e.target?.closest?.('[data-deal-template-menu]') ||
    e.target?.closest?.('[data-toast-container]') ||
    e.target?.closest?.('[data-toast-item]') ||
    e.target?.closest?.('.hail-data-panel') ||
    e.target?.closest?.('.parcel-details-panel') ||
    e.target?.closest?.('.lead-details-panel') ||
    e.target?.closest?.('.deal-details-panel') ||
    e.target?.closest?.('.team-details-panel') ||
    e.target?.closest?.('.activity-panel')
  ) {
    e.preventDefault()
  }
  existing?.(e)
}

/**
 * When `topLayer` is true the overlay + content are rendered at boosted
 * z-indices so the dialog floats above any currently-open panel that uses
 * the standard / blurOverlay / hideOverlay variants. Needed for panels that
 * open from inside LeadDetails (blurOverlay, z-10001) — without this they'd
 * render behind LeadDetails and be invisible.
 */
const INSTANT_PANEL_MOTION =
  'data-[state=open]:!duration-0 data-[state=closed]:!duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none'

const DialogContent = React.forwardRef(({ className, children, showCloseButton = true, hideOverlay = false, suppressBackdrop = false, focusOverlay = false, blurOverlay = false, nestedOverlay = false, topLayer = false, confirmLayer = false, panelMode, instantDismiss = false, onPointerDownOutside, onInteractOutside, onCloseAutoFocus, ...props }, ref) => {
  const useStackedDetailLayer = topLayer && nestedOverlay
  const effectiveNestedOverlay = nestedOverlay && !useStackedDetailLayer
  const effectiveHideOverlay = hideOverlay || useStackedDetailLayer
  const isPanel = (panelMode ?? isMapPanelClassName(className)) && !confirmLayer
  const contentMotion = cn(
    isPanel ? PANEL_CONTENT_MOTION : DEFAULT_CONTENT_MOTION,
    instantDismiss && INSTANT_PANEL_MOTION
  )
  const overlayMotion = cn(
    isPanel ? PANEL_OVERLAY_MOTION : 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
    instantDismiss && INSTANT_PANEL_MOTION
  )
  const zOverlay = confirmLayer ? 'z-[10040]' : topLayer ? 'z-[10020]' : 'z-[10000]'
  const zContent = confirmLayer ? 'z-[10041]' : topLayer ? 'z-[10021]' : 'z-[10001]'
  const zHideOverlay = confirmLayer ? 'z-[10040]' : topLayer ? 'z-[10020]' : 'z-[9998]'
  const zDefaultContent = confirmLayer ? 'z-[10041]' : topLayer ? 'z-[10021]' : 'z-[9999]'
  const contentPosition = cn(
    'fixed left-[50%] top-[50%] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4',
    isPanel
      ? 'border-0 bg-transparent p-0 shadow-none sm:rounded-lg'
      : 'border bg-background p-6 shadow-lg sm:rounded-lg'
  )
  const suppressCloseAutoFocus = (e) => {
    e.preventDefault()
    onCloseAutoFocus?.(e)
  }
  return (
  <DialogPortal container={typeof document !== 'undefined' ? document.getElementById('modal-root') || document.body : undefined}>
    {effectiveNestedOverlay ? (
      <>
        <DialogPrimitive.Overlay data-app-dialog-backdrop className={cn("fixed inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto", overlayMotion, zOverlay)} />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(contentPosition, contentMotion, zContent, className)}
          onPointerDownOutside={(e) => preventCloseWhenNestedOverlay(e, onPointerDownOutside)}
          onInteractOutside={(e) => preventCloseWhenNestedOverlay(e, onInteractOutside)}
          onCloseAutoFocus={isPanel ? suppressCloseAutoFocus : onCloseAutoFocus}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </>
    ) : effectiveHideOverlay && !suppressBackdrop ? (
      <DialogPrimitive.Overlay data-app-dialog-backdrop className={cn("fixed inset-0 bg-black/60 pointer-events-auto", overlayMotion, zHideOverlay)} />
    ) : focusOverlay ? (
      <DialogPrimitive.Overlay data-app-dialog-backdrop className={cn("fixed inset-0 bg-black/95 pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", confirmLayer ? 'z-[10040]' : topLayer ? 'z-[10020]' : 'z-[9998]')} />
    ) : blurOverlay ? (
      <>
        <DialogPrimitive.Overlay data-app-dialog-backdrop className={cn("fixed inset-0 bg-black/40 backdrop-blur-lg pointer-events-auto", overlayMotion, zOverlay)} />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(contentPosition, contentMotion, zContent, className)}
          onPointerDownOutside={(e) => preventCloseWhenNestedOverlay(e, onPointerDownOutside)}
          onInteractOutside={(e) => preventCloseWhenNestedOverlay(e, onInteractOutside)}
          onCloseAutoFocus={isPanel ? suppressCloseAutoFocus : onCloseAutoFocus}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </>
    ) : (
      <DialogOverlay className={confirmLayer ? 'z-[10040]' : topLayer ? 'z-[10020]' : undefined} />
    )}
    {!blurOverlay && !effectiveNestedOverlay && (
      <DialogPrimitive.Content
        ref={ref}
        className={cn(contentPosition, contentMotion, zDefaultContent, className)}
        onPointerDownOutside={(e) => preventCloseWhenNestedOverlay(e, onPointerDownOutside)}
        onInteractOutside={(e) => preventCloseWhenNestedOverlay(e, onInteractOutside)}
        onCloseAutoFocus={isPanel ? suppressCloseAutoFocus : onCloseAutoFocus}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    )}
  </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}

