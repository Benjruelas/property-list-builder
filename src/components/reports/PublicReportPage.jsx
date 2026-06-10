import { useEffect, useState } from 'react'
import { Loader2, Download, FileText } from 'lucide-react'
import { fetchPublicReport } from '../../utils/photoReports'
import { PublicFormBrandBar } from '../forms/PublicFormBrand'

export function PublicReportPage({ token }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const d = await fetchPublicReport(token)
        if (!cancelled) setData(d)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Unable to load report')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <PublicFormBrandBar className="mb-8" />
        <p className="text-gray-600">{error}</p>
      </div>
    )
  }

  const { report, lead, pdfDownloadUrl } = data || {}

  return (
    <div className="min-h-[100dvh] bg-gray-50 text-gray-900">
      <PublicFormBrandBar variant="header" className="border-b border-gray-200 bg-white" />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-start gap-3 mb-6">
          <FileText className="h-8 w-8 text-blue-600 shrink-0 mt-1" />
          <div>
            <h1 className="text-2xl font-bold">{report?.title || 'Photo Report'}</h1>
            {lead?.name && <p className="text-gray-600 mt-1">{lead.name}</p>}
            {lead?.address && <p className="text-sm text-gray-500">{lead.address}</p>}
          </div>
        </div>

        {(report?.sections || []).map((sec, i) => (
          <section key={sec.id || i} className="mb-8 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            {sec.subtitle && <h2 className="text-lg font-semibold mb-2">{sec.subtitle}</h2>}
            {sec.description && <p className="text-gray-600 text-sm whitespace-pre-wrap">{sec.description}</p>}
            <p className="text-xs text-gray-400 mt-3">{sec.photoIds?.length || 0} photos in this section</p>
          </section>
        ))}

        {pdfDownloadUrl && (
          <a
            href={pdfDownloadUrl}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            <Download className="h-5 w-5" />
            Download PDF report
          </a>
        )}
      </main>
    </div>
  )
}
