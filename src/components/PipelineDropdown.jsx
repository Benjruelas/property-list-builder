import { InlineDropdown } from './InlineDropdown'
import { normalizePipelineList } from '@/utils/pipelines'

/**
 * Inline pipeline picker — expands below trigger (no native select; safe inside transformed dialogs).
 */
export function PipelineDropdown({
  value,
  onChange,
  pipelines = [],
  placeholder = 'Select a pipeline…',
  allowEmpty = false,
  showLabel = true,
  label = 'Pipeline',
  className,
}) {
  const options = normalizePipelineList(pipelines).map((p) => ({
    id: p.id,
    label: p.title || 'Pipeline',
  }))

  return (
    <InlineDropdown
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      allowEmpty={allowEmpty}
      emptyLabel="None (unassigned)"
      showLabel={showLabel}
      label={label}
      className={className}
      hiddenWhenEmpty={!allowEmpty}
    />
  )
}

export default PipelineDropdown
