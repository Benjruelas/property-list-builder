import { QuoteIcon } from '../icons/QuoteIcon'
import { DocumentTemplatePickerDialog } from '../shared/DocumentTemplatePickerDialog'

function quoteTemplateSummary(template) {
  const count = (template?.lineItems || []).length
  if (!count) return 'No line items'
  return `${count} line item${count !== 1 ? 's' : ''}`
}

export function QuoteTemplatePickerDialog(props) {
  return (
    <DocumentTemplatePickerDialog
      {...props}
      icon={QuoteIcon}
      subtitle="Start from a saved template or create a blank quote."
      description="Choose a quote template or continue without one."
      noTemplateHint="Start with an empty quote"
      summaryFn={quoteTemplateSummary}
      emptyHint='Use “No template” above, or save a quote layout as a template from the Templates tab.'
    />
  )
}
