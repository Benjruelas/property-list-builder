import { useState } from 'react'
import { Loader2, Download, Send, Pencil, FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogDescription } from '../ui/dialog'
import { PanelHeader } from '../ui/panel-header'
import { Button } from '../ui/button'
import { displayLeadName, formatLeadAddress } from '@/utils/leads'
import { generatePhotoReportPdf } from '@/utils/photoReports'
import { logLeadReportEvent } from '@/utils/leadActivity'
import { showToast } from '../ui/toast'
import { SendReportDialog } from './SendReportDialog'

export function ReportDetail({
  open,
  report,
  lead,
  onClose,
  onBack,
  onEdit,
  onReportUpdated,
  getToken,
  leads = [],
  teams = [],
  teamMembership = null,
}) {
  const [generating, setGenerating] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)

  if (!open || !report) return null

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await generatePhotoReportPdf(getToken, report.id)
      onReportUpdated?.(res.report)
      showToast('PDF generated', 'success')
    } catch (e) {
      showToast(e.message || 'Generation failed', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async () => {
    if (!report.pdfKey) {
      showToast('Generate PDF first', 'error')
      return
    }
    try {
      const token = await getToken()
      const base = import.meta.env.DEV ? '/api' : `${window.location.origin}/api`
      const res = await fetch(`${base}/photo-reports?pdfKey=${encodeURIComponent(report.pdfKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${report.title || 'report'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showToast(e.message || 'Download failed', 'error')
    }
  }

  return (
    <>
      <Dialog open={open} modal={false} onOpenChange={(o) => !o && onClose?.()}>
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

            <div className="flex flex-col gap-2 pt-2">
              <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => onEdit?.(report)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit report
              </Button>
              <Button type="button" className="min-h-[44px]" onClick={handleGenerate} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                Generate PDF
              </Button>
              {report.pdfKey && (
                <Button type="button" variant="outline" className="min-h-[44px]" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              )}
              <Button type="button" className="min-h-[44px]" onClick={() => setSendOpen(true)}>
                <Send className="h-4 w-4 mr-2" />
                Send report
              </Button>
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
            await logLeadReportEvent(getToken, lead.id, `Photo report sent: ${updated.title}`, { reportId: updated.id })
          }
          setSendOpen(false)
        }}
      />
    </>
  )
}
