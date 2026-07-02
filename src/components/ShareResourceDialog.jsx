import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { ResourceSharePicker } from './ResourceSharePicker'

/**
 * Unified share dialog for lists, pipelines, paths, forms, etc.
 */
export function ShareResourceDialog({
  open,
  onOpenChange,
  title,
  intro = null,
  pipelineDialog = false,
  team = null,
  showTeamPicker = false,
  shareState,
  onShareStateChange,
  allowExternalSharing = false,
  sharedWithEmails = [],
  onRemoveSharedEmail,
  shareEmail = '',
  onShareEmailChange,
  shareEmailValid = null,
  shareEmailError = '',
  isValidatingShare = false,
  onShareEmailSave,
  secondaryLabel = 'Cancel',
  topLayer = false,
  nestedOverlay = false,
}) {
  const handleClose = () => onOpenChange?.(false)
  const stackedLayer = topLayer || nestedOverlay

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="map-panel share-list-dialog w-[min(92vw,22rem)] max-w-sm rounded-xl p-0 gap-0 overflow-hidden"
        focusOverlay={!stackedLayer}
        nestedOverlay={stackedLayer}
        topLayer={topLayer}
        showCloseButton={false}
        data-share-resource-dialog
        {...(pipelineDialog ? { 'data-share-pipeline-dialog': true } : {})}
      >
        <div className="share-dialog-inner">
          <DialogHeader className="share-dialog-header">
            <DialogTitle className="share-dialog-title">{title}</DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
            <button
              type="button"
              onClick={handleClose}
              className="share-dialog-close"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>

          <div className="share-dialog-body">
            {intro && <p className="share-dialog-intro">{intro}</p>}

            {showTeamPicker && team && (
              <ResourceSharePicker
                team={team}
                visibility={shareState.visibility}
                sharedMemberUids={shareState.sharedMemberUids}
                onChange={onShareStateChange}
                allowExternalSharing={allowExternalSharing}
                className="mb-0"
              />
            )}

            {allowExternalSharing && sharedWithEmails.length > 0 && (
              <div className="share-dialog-section">
                <p className="share-dialog-section-label">Shared with</p>
                <ul className="share-dialog-email-list">
                  {sharedWithEmails.map((email) => (
                    <li key={email} className="share-dialog-email-row group">
                      <span className="truncate">{email}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveSharedEmail?.(email)}
                        className="share-dialog-email-remove"
                        title="Remove from share list"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {allowExternalSharing ? (
              <>
                <div className="share-dialog-section">
                  <p className="share-dialog-section-label">Invite by email</p>
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={shareEmail}
                    onChange={(e) => onShareEmailChange?.(e.target.value)}
                    className={cn(
                      'share-dialog-input',
                      shareEmailValid === true && 'share-dialog-input--valid',
                      shareEmailValid === false && shareEmail.trim() && 'share-dialog-input--invalid'
                    )}
                  />
                  {shareEmailError && (
                    <p className="share-dialog-error">{shareEmailError}</p>
                  )}
                  {!shareEmailError && shareEmail.trim() && isValidatingShare && (
                    <p className="share-dialog-hint">Checking…</p>
                  )}
                </div>
                <div className="share-dialog-actions">
                  <Button
                    type="button"
                    onClick={onShareEmailSave}
                    disabled={!!(shareEmail.trim() && shareEmailValid === false) || isValidatingShare}
                    className={cn(
                      'share-dialog-btn share-dialog-btn--primary flex-1 min-w-0',
                      shareEmailValid === true && 'share-dialog-btn--valid'
                    )}
                  >
                    {isValidatingShare ? 'Checking…' : 'Share'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    className="share-dialog-btn share-dialog-btn--secondary flex-1 min-w-0"
                  >
                    {secondaryLabel}
                  </Button>
                </div>
              </>
            ) : (
              <div className="share-dialog-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="share-dialog-btn share-dialog-btn--primary flex-1 min-w-0"
                >
                  Done
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
