import { useState } from 'react'
import { Send, Pencil, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from '../ui/dialog'
import { handleChildPanelDismiss } from '../ui/panelDialogUtils'
import { PanelHeader } from '../ui/panel-header'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { logLeadReportEvent } from '@/utils/leadActivity'
import { SendReportDialog } from './SendReportDialog'
import { QuoteBrandHeader } from '../quotes/QuoteBrandHeader'
import { ViewAsClientButton } from '../ViewAsClientButton'
import { PanelActionButton } from '../ui/panel-action-button'
import { showConfirm } from '../ui/confirm-dialog'
import { getTeamEmailBranding, getTeamForMembership, getSenderDisplayName } from '@/utils/profile'
import { useAuth } from '@/contexts/AuthContext'

export function ReportDetail({
  open,
  report,
  lead,
  onClose,
  onBack,
  onEdit,
  onDelete,
  onReportUpdated,
  getToken,
  leads = [],
  teams = [],
  teamMembership = null,
}) {
  const { getToken: authGetToken, currentUser } = useAuth()
  const resolveToken = getToken || authGetToken
  const [sendOpen, setSendOpen] = useState(false)

  if (!open || !report) return null

  const team = getTeamForMembership(teams, teamMembership)
  const teamBranding = getTeamEmailBranding(team)
  const senderName = report.createdByName
    || (report.ownerId === currentUser?.uid ? getSenderDisplayName(currentUser) : '')
    || (report.ownerEmail || '').split('@')[0]
    || ''
  const senderEmail = report.ownerEmail || teamBranding.companyEmail || currentUser?.email || ''

  return (
    <>
      <Dialog
        open={open}
        modal={false}
        onOpenChange={(o) => handleChildPanelDismiss(o, onClose, {
          hasNestedOverlay: sendOpen,
          wasOpen: open,
        })}
      >
        <DialogContent
          className="map-panel list-panel reports-panel report-details-panel fullscreen-panel flex flex-col min-h-0 overflow-hidden p-0 max-md:w-full w-[min(96vw,32rem)] max-w-lg"
          showCloseButton={false}
          nestedOverlay
          topLayer
        >
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-white/10 flex-shrink-0 text-left" style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}>
            <DialogDescription className="sr-only">Report details</DialogDescription>
            <PanelHeader onBack={onBack ?? onClose} title={report.title || 'Report'} />
          </DialogHeader>

          <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 space-y-4">
            <QuoteBrandHeader
              variant="panel"
              businessName={teamBranding.businessName}
              logoBase64={teamBranding.logoBase64}
              senderName={senderName}
              senderEmail={senderEmail}
            />

            {lead && (
              <div>
                <div className="text-sm font-medium">{displayLeadName(lead)}</div>
                <div className="text-xs opacity-60">{formatLeadAddress(lead)}</div>
              </div>
            )}
            <div className="text-xs opacity-50 uppercase tracking-wide">{report.status || 'draft'}</div>

            {(report.sections || []).map((sec, i) => (
              <div key={sec.id} className="report-section-card">
                <div className="text-sm font-semibold">{sec.subtitle || `Section ${i + 1}`}</div>
                {sec.description && <p className="text-xs opacity-70 mt-1">{sec.description}</p>}
                <p className="text-[10px] opacity-40 mt-2">{sec.photoIds?.length || 0} photos</p>
              </div>
            ))}

            <div className="quote-details-actions flex flex-col gap-2.5 pt-2">
              <PanelActionButton variant="primary" onClick={() => setSendOpen(true)}>
                <Send className="h-4 w-4 shrink-0" />
                Send report
              </PanelActionButton>
              <ViewAsClientButton getToken={resolveToken} type="report" entityId={report.id} />
              <PanelActionButton onClick={() => onEdit?.(report)}>
                <Pencil className="h-4 w-4 shrink-0" />
                Edit report
              </PanelActionButton>
              <PanelActionButton
                variant="danger"
                onClick={async () => {
                  const ok = await showConfirm({
                    title: 'Delete report?',
                    message: 'This cannot be undone.',
                    confirmLabel: 'Delete',
                    destructive: true,
                  })
                  if (ok) onDelete?.(report)
                }}
              >
                <Trash2 className="h-4 w-4 shrink-0" /> Delete
              </PanelActionButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SendReportDialog
        open={sendOpen}
        report={report}
        onClose={() => setSendOpen(false)}
        leads={leads}
        teams={teams}
        teamMembership={teamMembership}
        onSent={async (updated) => {
          onReportUpdated?.(updated)
          if (lead?.id) {
            await logLeadReportEvent(resolveToken, lead.id, `Photo report sent: ${updated.title}`, { reportId: updated.id })
          }
          setSendOpen(false)
        }}
      />
    </>
  )
}
