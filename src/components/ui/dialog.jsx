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

/** Prevents Radix Dialog from closing when the user interacts inside portaled UI (schedule picker, lead task/pipe menus, toasts). */
const preventCloseWhenNestedOverlay = (e, existing) => {
  if (
    e.target?.closest?.('.schedule-picker-panel') ||
    e.target?.closest?.('[data-task-menu]') ||
    e.target?.closest?.('[data-pipe-menu]') ||
    e.target?.closest?.('[data-toast-container]') ||
    e.target?.closest?.('[data-toast-item]')
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
const DialogContent = React.forwardRef(({ className, children, showCloseButton = true, hideOverlay = false, focusOverlay = false, blurOverlay = false, nestedOverlay = false, topLayer = false, onPointerDownOutside, onInteractOutside, ...props }, ref) => {
  const zOverlay = topLayer ? 'z-[10020]' : 'z-[10000]'
  const zContent = topLayer ? 'z-[10021]' : 'z-[10001]'
  const zHideOverlay = topLayer ? 'z-[10020]' : 'z-[9998]'
  const zDefaultContent = topLayer ? 'z-[10021]' : 'z-[9999]'
  return (
  <DialogPortal container={typeof document !== 'undefined' ? document.getElementById('modal-root') || document.body : undefined}>
    {nestedOverlay ? (
      <>
        <DialogPrimitive.Overlay data-app-dialog-backdrop className={cn("fixed inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", zOverlay)} />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "fixed left-[50%] top-[50%] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg pointer-events-auto duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
            zContent,
            className
          )}
          onPointerDownOutside={(e) => preventCloseWhenNestedOverlay(e, onPointerDownOutside)}
          onInteractOutside={(e) => preventCloseWhenNestedOverlay(e, onInteractOutside)}
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
    ) : hideOverlay ? (
      <DialogPrimitive.Overlay data-app-dialog-backdrop className={cn("fixed inset-0 bg-black/60 pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", zHideOverlay)} />
    ) : focusOverlay ? (
      <DialogPrimitive.Overlay data-app-dialog-backdrop className={cn("fixed inset-0 bg-black/95 pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", topLayer ? 'z-[10020]' : 'z-[9998]')} />
    ) : blurOverlay ? (
      <>
        <DialogPrimitive.Overlay data-app-dialog-backdrop className={cn("fixed inset-0 bg-black/40 backdrop-blur-lg pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", zOverlay)} />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "fixed left-[50%] top-[50%] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg pointer-events-auto duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
            zContent,
            className
          )}
          onPointerDownOutside={(e) => preventCloseWhenNestedOverlay(e, onPointerDownOutside)}
          onInteractOutside={(e) => preventCloseWhenNestedOverlay(e, onInteractOutside)}
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
      <DialogOverlay className={topLayer ? 'z-[10020]' : undefined} />
    )}
    {!blurOverlay && !nestedOverlay && (
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg pointer-events-auto duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          zDefaultContent,
          className
        )}
        onPointerDownOutside={(e) => preventCloseWhenNestedOverlay(e, onPointerDownOutside)}
        onInteractOutside={(e) => preventCloseWhenNestedOverlay(e, onInteractOutside)}
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

