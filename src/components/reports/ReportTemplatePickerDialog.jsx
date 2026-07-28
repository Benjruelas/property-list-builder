import { FileText } from 'lucide-react'
import { DocumentTemplatePickerDialog } from '../shared/DocumentTemplatePickerDialog'

function reportTemplateSummary(template) {
  const count = (template?.sections || []).length
  if (!count) return 'No sections'
  return `${count} section${count !== 1 ? 's' : ''}`
}

export function ReportTemplatePickerDialog(props) {
  return (
    <DocumentTemplatePickerDialog
      {...props}
      icon={FileText}
      description="Choose a report template or continue without one."
      noTemplateHint="Start with a blank report"
      summaryFn={reportTemplateSummary}
    />
  )
}
