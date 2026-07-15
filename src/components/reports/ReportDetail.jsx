import { useState, useMemo, useCallback } from 'react'
import { Send, Pencil, Trash2, Eye, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from '../ui/dialog'
import { handleChildPanelDismiss } from '../ui/panelDialogUtils'
import { PanelHeader } from '../ui/panel-header'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { SendAsField } from '../shared/SendAsField'
import { QuoteBrandHeader } from '../quotes/QuoteBrandHeader'
import { fetchClientPreviewUrl, prepareClientPreviewTab, closeClientPreviewTab, openClientPreviewUrl } from '@/utils/clientPreview'
import { showToast } from '../ui/toast'
import { showConfirm } from '../ui/confirm-dialog'
import { getTeamEmailBranding, getTeamForMembership, getSenderDisplayName } from '@/utils/profile'
import { useAuth } from '@/contexts/AuthContext'
import { getAllTeamMembers } from '@/utils/teamTaskUtils'
import { memberPrimaryLabel } from '@/components/pickers/entityPickerShared'
import { updatePhotoReport } from '@/utils/photoReports'
import { cn } from '@/lib/utils'

function ReportActionTile({ icon: Icon, label, onClick, disabled, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'report-detail-action-tile',
        danger && 'report-detail-action-tile--danger',
        disabled && 'opacity-40',
      )}
    >
      <Icon className="report-detail-action-icon" aria-hidden />
      <span className="report-detail-action-label">{label}</span>
    </button>
  )
}

export function ReportDetail({
  open,
  report,
  lead,
  onClose,
  onBack,
  onSend,
  onEdit,
  onDelete,
  onReportUpdated,
  getToken,
  leads = [],
  teams = [],
  teamMembership = null,
  panelDockSlot,
  primaryDetail = false,
}) {
  const { getToken: authGetToken, currentUser } = useAuth()
  const resolveToken = getToken || authGetToken
  const [previewLoading, setPreviewLoading] = useState(false)
  const [savingSender, setSavingSender] = useState(false)
  const teamMembers = useMemo(() => getAllTeamMembers(teams), [teams])

  const team = getTeamForMembership(teams, teamMembership)
  const teamBranding = getTeamEmailBranding(team)

  const resolveDisplaySender = useCallback(() => {
    if (!report) {
      return { name: '', email: '' }
    }
    const preferredUid = report.displaySenderUid || report.lastSentByUid || null
    if (preferredUid && preferredUid !== currentUser?.uid) {
      const member = teamMembers.find((m) => m.uid === preferredUid)
      if (member) {
        return {
          name: memberPrimaryLabel(member),
          email: member.email || '',
        }
      }
    }
    if (report.lastSentByName) {
      return {
        name: report.lastSentByName,
        email: report.lastSentByEmail || '',
      }
    }
    if (report.createdByName) {
      return {
        name: report.createdByName,
        email: report.createdByEmail || '',
      }
    }
    return {
      name: report.ownerId === currentUser?.uid
        ? getSenderDisplayName(currentUser)
        : (report.ownerEmail || '').split('@')[0] || '',
      email: report.ownerEmail || teamBranding.companyEmail || currentUser?.email || '',
    }
  }, [report, teamMembers, currentUser, teamBranding])

  const { name: senderName, email: senderEmailBase } = resolveDisplaySender()
  const senderEmail = senderEmailBase || report?.ownerEmail || teamBranding.companyEmail || currentUser?.email || ''
  const canPickSender = teamMembers.filter((m) => m.uid && m.uid !== currentUser?.uid).length > 0

  const handleChangeDisplaySender = useCallback(async (nextUid) => {
    if (!report?.id || savingSender) return
    setSavingSender(true)
    try {
      let createdByName = getSenderDisplayName(currentUser)
      let createdByEmail = currentUser?.email || ''
      const displaySenderUid = nextUid || null
      if (nextUid && nextUid !== currentUser?.uid) {
        const member = teamMembers.find((m) => m.uid === nextUid)
        if (member) {
          createdByName = memberPrimaryLabel(member)
          createdByEmail = member.email || ''
        }
      }
      const updated = await updatePhotoReport(resolveToken, report.id, {
        displaySenderUid,
        createdByName,
        createdByEmail,
      })
      onReportUpdated?.(updated)
    } catch (e) {
      showToast(e.message || 'Could not update sender', 'error')
    } finally {
      setSavingSender(false)
    }
  }, [report?.id, savingSender, currentUser, teamMembers, resolveToken, onReportUpdated])

  if (!open) return null

  if (!report) {
    return (
      <Dialog
        open={open}
        modal={false}
        onOpenChange={(o) => handleChildPanelDismiss(o, onClose, {
          wasOpen: open,
        })}
      >
        <DialogContent
          className="map-panel list-panel reports-panel report-details-panel fullscreen-panel flex flex-col min-h-0 overflow-hidden p-0 max-md:w-full max-md:max-w-none w-[min(96vw,36rem)] max-w-xl"
          showCloseButton={false}
          panelDockSlot={panelDockSlot}
          nestedOverlay={!primaryDetail}
          topLayer
          hideOverlay={primaryDetail}
          suppressBackdrop={primaryDetail}
        >
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-white/10 flex-shrink-0 text-left">
            <DialogDescription className="sr-only">Loading report</DialogDescription>
            <PanelHeader onBack={onBack || onClose} title="Report" />
          </DialogHeader>
          <div className="flex-1 flex items-center justify-center min-h-0 py-16" role="status" aria-live="polite">
            <Loader2 className="h-6 w-6 animate-spin opacity-60" aria-hidden />
            <span className="sr-only">Loading report</span>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const statusLabel = String(report.status || 'draft').replace(/_/g, ' ')

  const handleViewAsClient = async () => {
    if (previewLoading || !report.id) return
    const previewWindow = prepareClientPreviewTab()
    if (!previewWindow) {
      showToast('Allow popups to open the client preview', 'error')
      return
    }
    setPreviewLoading(true)
    try {
      const url = await fetchClientPreviewUrl(resolveToken, { type: 'report', id: report.id })
      if (!openClientPreviewUrl(url, previewWindow)) {
        closeClientPreviewTab(previewWindow)
        showToast('Could not open client preview tab', 'error')
      }
    } catch (e) {
      closeClientPreviewTab(previewWindow)
      showToast(e.message || 'Could not load client preview link', 'error')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleDelete = async () => {
    const ok = await showConfirm({
      title: 'Delete report?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (ok) onDelete?.(report)
  }

  return (
    <>
      <Dialog
        open={open}
        modal={false}
        onOpenChange={(o) => handleChildPanelDismiss(o, onClose, {
          wasOpen: open,
        })}
      >
        <DialogContent
          className="map-panel list-panel reports-panel report-details-panel fullscreen-panel flex flex-col min-h-0 overflow-hidden p-0 max-md:w-full max-md:max-w-none w-[min(96vw,36rem)] max-w-xl"
          showCloseButton={false}
          panelDockSlot={panelDockSlot}
          nestedOverlay={!primaryDetail}
          topLayer
          hideOverlay={primaryDetail}
          suppressBackdrop={primaryDetail}
        >
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-white/10 flex-shrink-0 text-left" style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
            <DialogDescription className="sr-only">Report details</DialogDescription>
            <PanelHeader onBack={onBack ?? onClose} title={report.title || 'Report'} />
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-5 py-4 space-y-4">
            <QuoteBrandHeader
              variant="panel"
              businessName={teamBranding.businessName}
              logoBase64={teamBranding.logoBase64}
              senderName={senderName}
              senderEmail={senderEmail}
            />

            <SendAsField
              label="Shown to client as"
              currentUser={currentUser}
              teams={teams}
              senderUid={report.displaySenderUid || null}
              onChangeSenderUid={handleChangeDisplaySender}
              disabled={savingSender}
              hint={canPickSender
                ? 'This name appears on the report when clients view or receive it.'
                : 'Add teammates in Teams to choose a different sender.'}
            />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {lead ? (
                  <>
                    <div className="text-sm font-medium truncate">{displayLeadName(lead)}</div>
                    <div className="text-xs opacity-60 truncate">{formatLeadAddress(lead)}</div>
                  </>
                ) : (
                  <div className="text-sm opacity-60">No linked lead</div>
                )}
              </div>
              <span className="report-detail-status shrink-0">{statusLabel}</span>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wide opacity-45">Sections</p>
              {(report.sections || []).length === 0 ? (
                <p className="text-sm opacity-50">No sections yet</p>
              ) : (
                (report.sections || []).map((sec, i) => (
                  <div key={sec.id} className="report-section-card">
                    <div className="text-sm font-semibold">{sec.subtitle || `Section ${i + 1}`}</div>
                    {sec.description && <p className="text-xs opacity-70 mt-1">{sec.description}</p>}
                    <p className="text-[10px] opacity-40 mt-2">{sec.photoIds?.length || 0} photos</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div
            className="report-detail-footer flex-shrink-0"
            style={{ paddingBottom: 'calc(0.85rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="report-detail-actions-row" role="toolbar" aria-label="Report actions">
              <ReportActionTile
                icon={Send}
                label="Send"
                onClick={() => onSend?.(report)}
              />
              <ReportActionTile
                icon={Eye}
                label={previewLoading ? 'Opening…' : 'View'}
                onClick={handleViewAsClient}
                disabled={previewLoading}
              />
              <ReportActionTile
                icon={Pencil}
                label="Edit"
                onClick={() => onEdit?.(report)}
              />
              <ReportActionTile
                icon={Trash2}
                label="Delete"
                danger
                onClick={handleDelete}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
