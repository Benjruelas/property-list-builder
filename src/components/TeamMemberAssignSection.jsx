import { TeamMemberPickerField } from './pickers/TeamMemberPickerField'

/**
 * Checkbox list of team members for task assignment (team-shared pipelines).
 * Delegates to TeamMemberPickerField for consistent search + avatar UX.
 */
export function TeamMemberAssignSection({
  members = [],
  selectedUids = [],
  onToggle,
  onClearAll,
  disabled = false,
  title = 'Assign to:',
  description = '',
  className = '',
  compact = false,
  collapsible = true,
}) {
  return (
    <TeamMemberPickerField
      label={title}
      members={members}
      selectedUids={selectedUids}
      onToggle={onToggle}
      onClearAll={onClearAll}
      disabled={disabled}
      description={description}
      collapsible={collapsible}
      className={compact ? `team-member-assign--compact ${className}`.trim() : className}
    />
  )
}

/** Light theme variant — kept for legacy dialogs; uses dark picker styling in map panels. */
export function TeamMemberAssignSectionLight(props) {
  return <TeamMemberAssignSection {...props} collapsible={false} />
}
