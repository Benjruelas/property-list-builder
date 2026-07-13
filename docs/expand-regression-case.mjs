/**
 * Expand legacy one-line regression steps into structured action/verify/ui steps.
 */

import { step, tc } from './regression-test-schema.mjs'

const UI_BY_SECTION = {
  '01': 'Auth / bootstrap',
  '02': 'Map view',
  '03': 'Navigation',
  '04': 'Lists panel',
  '05': 'Leads panel',
  '06': 'Deals / Pipes',
  '07': 'Tasks / Schedule',
  '08': 'Paths / Activity / Settings',
  '09': 'Forms / Quotes / Reports',
  '10': 'Teams / Outreach',
  '11': 'Cross-panel flow',
  '12': 'Public / edge case',
}

const UI_KEYWORDS = [
  [/menu|sign in|sign up|forgot|login|logout|auth|tour|permission/i, 'Auth / menu'],
  [/map|parcel|zoom|recenter|compass|multi-select|path recording|basemap|tile/i, 'Map chrome'],
  [/popup|parcel details|skip trace|hail|contact tab|overview tab|property tab|value tab|owner tab|legal tab/i, 'Parcel UI'],
  [/action bar|pipes|tasks|schedule|leads|deals|quotes|forms|reports|activity|settings|overflow/i, 'Action bar / menu'],
  [/lists? panel|list row|parcel list|highlight|eye icon|add to list/i, 'Lists panel'],
  [/lead|create lead|lead detail|lead status|lead note/i, 'Leads CRM'],
  [/deal|pipeline|pipe|kanban|column|drag|template/i, 'Deals / Pipes'],
  [/task|schedule|calendar|month view|week view|day view|hour slot/i, 'Tasks / Schedule'],
  [/path|activity feed|settings|sync|theme|notification/i, 'Settings / Activity / Paths'],
  [/form|quote|report|template|pdf|public url|\?form=|\?quote=|\?report=/i, 'Forms / Quotes / Reports'],
  [/team|outreach|email|text template|composer|bulk|phone/i, 'Teams / Outreach'],
  [/confirm|toast|delete|save|submit/i, 'Dialog / feedback'],
]

/** Expand vague legacy shorthand into discrete actions. */
const FLOW_EXPANSIONS = {
  'Full convert flow': [
    'Click a parcel polygon on the map',
    'Tap Convert to lead in the parcel popup',
    'Complete the Create Lead form and Save',
    'Open the new lead in Lead Details',
  ],
  'Add to list flow': [
    'Click a parcel polygon on the map',
    'Tap Add to list in the parcel popup',
    'Select the target list in banner mode',
    'Open the list parcel view to confirm the parcel',
  ],
  'Complete add flow': [
    'With multi-select active, tap + Add to list on the map banner',
    'Pick the target list',
    'Confirm parcels are added',
  ],
  'Bulk flow from outreach': [
    'Open Menu → Outreach',
    'Start bulk email flow with a template selected',
    'Pick a list with recipient emails',
    'Review BulkEmailPreview and confirm send',
  ],
  'Full email chain': [
    'Open Parcel Details Contact tab for a parcel with email',
    'Tap the email address',
    'Pick an outreach template',
    'Review EmailComposer content before sending or closing',
  ],
  'Convert from map flow': [
    'Click a parcel polygon on the map',
    'Tap Convert to lead in the parcel popup',
    'Save the new lead',
  ],
  'Create pipeline dialog': [
    'Open Pipes from the action bar',
    'Open create pipeline dialog',
    'Enter pipeline name and save',
  ],
  'Create/edit/delete template': [
    'Open Quotes → Templates tab',
    'Create a new template',
    'Edit the template and save',
    'Delete the template and confirm',
  ],
  'Templates tab actions': [
    'Open Reports panel → Templates tab',
    'Review template list',
    'Open a template action from the row menu',
  ],
  'Create deal action': [
    'Open Deals panel',
    'Tap create deal (+ or header action)',
    'Enter valid values in every required deal field',
    'Click Save in the create deal dialog',
  ],
  'Send quote dialog': [
    'Open quote detail for a ready quote',
    'Open Send quote dialog',
    'Enter a valid recipient and complete every required send field',
    'Click Send quote',
  ],
  'Send report': [
    'Open report detail for a ready report',
    'Open Send report dialog',
    'Enter a valid recipient and complete every required send field',
    'Click Send report',
  ],
  'Create team': [
    'Open Menu → Teams',
    'Tap create team',
    'Enter team name and save',
  ],
  'Create template': [
    'Open Menu → Outreach',
    'Switch to the relevant templates tab',
    'Create and save a new template',
  ],
  'Navigate between auth modals via links': [
    'Open Sign In modal',
    'Switch to Sign Up via link',
    'Switch to Forgot password via link',
    'Return to Sign In via link',
  ],
  'All/Leads/Deals/Tasks/Other tabs': [
    'Open Menu → Activity',
    'Click All tab',
    'Click Leads tab',
    'Click Deals tab',
    'Click Tasks tab',
    'Click Other tab',
  ],
  'Click each tab': null, // handled per test title context below
}

function expandFlowStep(raw, legacy) {
  if (FLOW_EXPANSIONS[raw]) return FLOW_EXPANSIONS[raw]
  if (raw === 'Click each tab') {
    const t = legacy.title.toLowerCase()
    if (t.includes('lists')) return ['Click All tab', 'Click Mine tab', 'Click Shared tab', 'Click On map tab']
    if (t.includes('paths')) return ['Click All tab', 'Click Mine tab', 'Click Shared tab', 'Click On map tab']
  }
  return splitLegacyStep(raw)
}

function expandPreconditions(pre, viewport, roles) {
  const parts = [pre.endsWith('.') ? pre : `${pre}.`]
  if (viewport === 'desktop') parts.push('Use desktop viewport (width ≥768px).')
  else if (viewport === 'mobile') parts.push('Use mobile viewport (width <768px) or device emulation.')
  else parts.push('Test on both mobile and desktop if time allows.')
  if (roles.length === 1 && roles[0] !== 'logged-out') {
    parts.push(`Signed in as: ${roles.join(', ')}.`)
  } else if (roles.length === 1 && roles[0] === 'logged-out') {
    parts.push('User is logged out.')
  }
  return parts.join(' ')
}

function inferUi(action, legacy) {
  for (const [re, label] of UI_KEYWORDS) {
    if (re.test(action) || re.test(legacy.title)) return label
  }
  return UI_BY_SECTION[legacy.section] || 'App'
}

function splitLegacyStep(raw) {
  if (!raw.includes(', ')) return [raw]
  if (/,\s+(?=(?:Tap|Click|Enter|Open|Select|Toggle|Switch|Use|Drag|Move|Enable|Disable|Verify|Review|Trigger|Wait|Load|Perform|Navigate|Complete|Fill|Save|Submit|Delete|Confirm|Accept|Decline|Create|Share|Export|Rename|Add|Remove|Step|Finish|Pick|Upload|Search|Type|Menu|Sign|Forgot|Close|Back|View|Compare|Try|Inspect|Phone|Bulk|Refresh|Simulate|Edit|Remove|Highlight|Scrub|Exit|Start|Stop|Move|Drag|Refresh|Perform|Navigate))/i.test(raw)) {
    return raw.split(/,\s+(?=(?:Tap|Click|Enter|Open|Select|Toggle|Switch|Use|Drag|Move|Enable|Disable|Verify|Review|Trigger|Wait|Load|Perform|Navigate|Complete|Fill|Save|Submit|Delete|Confirm|Accept|Decline|Create|Share|Export|Rename|Add|Remove|Step|Finish|Pick|Upload|Search|Type|Menu|Sign|Forgot|Close|Back|View|Compare|Try|Inspect|Phone|Bulk|Refresh|Simulate|Edit|Remove|Highlight|Scrub|Exit|Start|Stop|Move|Drag|Refresh|Perform|Navigate|Preview|Send|Upload|Switch|Change|Toggle|Type|Add|Remove|Mark|Grant|Deny|Accept|Decline|Transfer|Invite|Restart|Enable|Disable|Compare|Simulate|Perform|Refresh|Login|Logout))/i)
  }
  return [raw]
}

function normalizeAction(raw) {
  let a = raw.trim()
  if (/^⋮\s*→/.test(a)) a = `Open the row overflow menu, then select ${a.replace(/^⋮\s*→\s*/, '')}`
  else if (/^\+\s*/.test(a)) a = `Click ${a}`
  else if (/^(month|week|day) view$/i.test(a)) a = `Select ${a}`
  else if (/^(email|text) templates tab$/i.test(a)) a = `Select the ${a}`
  else if (/^templates tab actions$/i.test(a)) a = 'Open the Templates tab and inspect the available row actions'
  else if (/^tag filter menu$/i.test(a)) a = 'Open the tag filter menu'
  else if (/^go to map action$/i.test(a)) a = 'Click the Go to map action'
  else if (/^schedule action$/i.test(a)) a = 'Click the Schedule action and choose a date'
  else if (/^photos from parcel$/i.test(a)) a = 'Open the parcel photo actions and select Photo Mode'
  else if (/^capture\/upload$/i.test(a)) a = 'Capture a photo or upload an image file'
  else if (/^done$/i.test(a)) a = 'Tap Done'
  else if (/^restore network and retry$/i.test(a)) a = 'Restore the network connection, then retry the failed action'
  else if (/^other user opens pipes$/i.test(a)) a = 'Sign in as the invited user, then open Pipes'
  else if (/^login as member$/i.test(a)) a = 'Sign out, then sign in with the team-member test account'
  else if (/^activate\/open deal from task$/i.test(a)) a = 'Click the linked deal action on the task'
  else if (/^resize viewport/i.test(a)) a = `Use responsive device tools to ${a.charAt(0).toLowerCase() + a.slice(1)}`
  else if (/^check /i.test(a)) a = `Inspect ${a.slice(6)}`
  else if (/^expand /i.test(a)) a = `Click to ${a.charAt(0).toLowerCase() + a.slice(1)}`
  else if (/^mark /i.test(a)) a = `Click the control to ${a.charAt(0).toLowerCase() + a.slice(1)}`
  else if (/^complete .+ form$/i.test(a)) a = `Enter valid test data in every required field of the ${a.replace(/^complete\s+/i, '')}`
  else if (/^fill (?:the )?form$/i.test(a)) a = 'Enter valid test data in every required form field'
  else if (/^fill required fields$/i.test(a)) a = 'Enter valid test data in every required field'

  if (/^(tap|click|open|enter|select|choose|toggle|switch|use|drag|move|enable|disable|verify|review|trigger|wait|load|perform|navigate|complete|fill|save|submit|delete|confirm|accept|decline|create|share|export|rename|add|remove|clear|step|finish|pick|upload|search|type|menu|sign|forgot|close|back|view|compare|try|inspect|phone|bulk|refresh|simulate|edit|highlight|scrub|exit|start|stop|preview|send|change|grant|deny|invite|transfer|restart|enable|login|logout)/i.test(a)) {
    return a.charAt(0).toUpperCase() + a.slice(1)
  }
  return a
}

function actionObject(action) {
  return action
    .replace(/^(tap|click|open|enter|select|toggle|switch|use|drag|move|enable|disable|review|trigger|wait for|wait|load|perform|navigate to|navigate|complete|fill|save|submit|delete|confirm|accept|decline|create|share|export|rename|add|remove|step through|finish|pick|upload|search|type|close|back from|back|view|compare|try|inspect|refresh|simulate|edit|highlight|scrub|exit|start|stop|preview|send|change|grant|deny|invite|transfer|restart)\s+/i, '')
    .replace(/[.]$/, '')
}

function visibleTarget(action) {
  const object = actionObject(action)
  const pathTarget = object.split(/\s*→\s*/).at(-1)
  return pathTarget
    .replace(/^to\s+/i, '')
    .replace(/\s+(from|via|using|on)\s+.+$/i, '')
    .replace(/^the\s+/i, '')
}

function nextStepControl(nextAction) {
  if (!nextAction) return ''
  return ` The control needed for the next step (“${nextAction}”) is visible and enabled.`
}

function makeObjective(check) {
  const exactReplacements = new Map([
    ['filtering works', 'only records for the selected filter remain visible and the displayed count matches them'],
    ['inline rename works', 'the edited name appears in the row and remains after closing and reopening the panel'],
    ['tag picker works', 'the tag picker opens, the selected tags appear on the row, and they remain after reopening it'],
    ['send dialog works', 'the send dialog accepts its required fields and displays a success result after submission'],
    ['parcel list view works', 'the parcel appears as an expandable row in the parcel list view'],
    ['templates manage correctly', 'the created template appears, the edited values persist, and the deleted template disappears'],
    ['list filters correctly', 'only lists belonging to the selected tab remain visible and the displayed count matches them'],
    ['items filter correctly', 'only activity items belonging to the selected tab remain visible'],
    ['grant/deny handled gracefully', 'both Grant and Deny leave the app interactive with no blank screen or uncaught-error message'],
    ['preview works', 'the file preview opens and displays the selected file'],
  ])
  return exactReplacements.get(check.toLowerCase()) || check.charAt(0).toLowerCase() + check.slice(1)
}

function explicitFinalVerify(expected) {
  const checks = expected
    .split(/\s*;\s*/)
    .map((part) => part.trim().replace(/[.]$/, ''))
    .filter(Boolean)
  return `Final-state checks: ${checks.map((check) => `verify ${makeObjective(check)}`).join('; ')}.`
}

function inferVerify(action, legacy, nextAction, isLast) {
  const a = action.toLowerCase()
  const object = actionObject(action)
  const target = visibleTarget(action)
  const next = nextStepControl(nextAction)

  if (isLast) return explicitFinalVerify(legacy.expected)

  if (/^(delete|remove)/.test(a) && /^confirm/i.test(nextAction)) {
    return `A confirmation dialog identifies the ${target} target and shows explicit Confirm and Cancel controls.${next}`
  }
  if (/^confirm/.test(a)) {
    return `The confirmation dialog closes and the affected record is visibly removed or updated in the current view.${next}`
  }
  if (/^(save|submit|finish|stop recording|tap sync now)/.test(a) || /and save$/i.test(a)) {
    return `A success indicator appears, the submitted values remain visible, and no unsaved or validation state remains.${next}`
  }
  if (/^(create)/.test(a)) {
    return `The create interface or newly created ${legacy.title.toLowerCase()} record is visible, with the entered values intact.${next}`
  }
  if (/^(accept|decline|send|upload|logout|transfer)/.test(a)) {
    return `Visible feedback confirms “${action}”; the prior pending state is replaced by its completed state.${next}`
  }
  if (/^(enter|type|fill|edit|rename|add email|add phone)/.test(a)) {
    return `Every field named in “${object}” visibly retains its test value; no validation message blocks progress.${next}`
  }
  if (/^add /.test(a)) {
    return `${target} appears in the current selection, list, or editor and is not marked invalid.${next}`
  }
  if (/^share /.test(a)) {
    return `The sharing interface for ${target} is visible and shows the recipient or permission controls required to continue.${next}`
  }
  if (/^search /.test(a)) {
    return `The search field retains the entered query and the visible results refresh for that query.${next}`
  }
  if (/^use responsive device tools/.test(a)) {
    return `The responsive viewport readout reaches each specified width and the application visibly reflows at each breakpoint.${next}`
  }
  if (/^with .+tap /.test(a)) {
    return `${target} opens the next picker or dialog and preserves the current selection.${next}`
  }
  if (/^(capture|complete)/.test(a)) {
    return `The values or media produced by “${action}” appear in the current review state with no validation error.${next}`
  }
  if (/^(pick|select|choose|toggle|switch|change|enable|disable|clear|drag|move|scrub|expand|collapse)/.test(a)) {
    return `The ${target} control visibly shows the selected option or changed state, and dependent content updates to match it.${next}`
  }
  if (/^(review|view|inspect|verify|compare)/.test(a)) {
    return `${object} is visible and can be checked against this case’s required state: ${legacy.expected}.${next}`
  }
  if (/^refresh/.test(a)) {
    return `The current page reloads and the application loading state or app shell becomes visible.${next}`
  }
  if (/^(open|tap|click|navigate|menu|sign in|sign up|load|trigger|start|try|perform|simulate|use template|phone →|bulk|go to|restart tour|step through)/.test(a)) {
    return `${target} is visible and interactive, with no error banner, blank content area, or disabled required control.${next}`
  }
  if (/^(wait|check completion)/.test(a)) {
    return `Any progress indicator for ${object} finishes and a visible success or error result replaces it.${next}`
  }
  if (/^(close|back|exit|cancel|dismiss)/.test(a)) {
    return `${object} is no longer visible; the underlying ${legacy.title.toLowerCase()} context is visible and responds to input.${next}`
  }
  return `The current UI visibly reflects “${action}” and preserves the data needed by the next step; no error state is present.${next}`
}

function needsBootstrapStep(firstAction, preconditions, legacy) {
  const a = firstAction.toLowerCase()
  if (/^open app|^load app|^menu|^sign in|^tap leads|^tap pipes|^tap deals|^tap tasks|^tap schedule|^open deals|^open tasks|^open schedule|^open settings|^open public|^simulate|^perform save|^trigger delete|^menu shows|^share (list|path|pipe)|^login as member|^move deal column|^refresh page|^accept invite|^decline invite|^create team|^navigate between|^step through|^enable multi-select|^click a parcel|^open menu|^settings →|^open public url/i.test(a)) {
    return false
  }
  if (/popup open|details open|lists panel open|leads panel open|deals panel|tasks docked|only tasks open|schedule open|outreach open|settings open|activity and tasks open|activity\+tasks|lead detail open|deal detail open|open deal|nested detail open|multi-select active|multi-select mode active|hail panel open|parcellistpanel open|expanded row|list highlighted|add-to-list from popup|opened lead from activity|details open with|file attached|valid \?form=|valid \?quote=|valid \?report=/i.test(preconditions)) {
    return true
  }
  return needsPanelEntryStep(legacy, firstAction, preconditions)
}

function needsPanelEntryStep(legacy, firstAction, preconditions) {
  const a = firstAction.toLowerCase()
  const pre = preconditions.toLowerCase()
  if (legacy.section === '04' && /lists exist|tagged lists|list with|own list|shared list|20 lists/.test(pre) && !/lists panel open/.test(pre)) {
    return true
  }
  if (legacy.section === '05' && /leads exist|tagged leads|leads access|lead with|lead without|photos on lead/.test(pre) && !/lead detail open/.test(pre)) {
    return true
  }
  if (legacy.section === '06' && /deals exist|closed deals|active deal|deal in|pipeline exists|multiple pipelines|deal open|collaborate permission/.test(pre) && !/deal detail open|open deal|deals panel/.test(pre)) {
    return true
  }
  if (legacy.section === '07' && /tasks panel|pipeline tasks|standalone tasks|completed tasks|scheduled task|task on calendar|task with|task linked|schedule open|opened schedule/.test(pre)) {
    return !/^schedule |^month |^week |^day |^prev\/|^view current|^click empty|^click task block|^eye toggle|^\+ new task|^open edit|^delete task|^activate\/|^view on schedule/.test(a)
  }
  if (legacy.section === '08' && /settings open|paths exist|activity items|many items|skip traced/.test(pre)) {
    return !/^edit |^switch |^change |^toggle |^tap sync|^open skip|^click each tab|^search |^click path|^eye icon|^⋮ →|^all\/leads\/deals|^open menu → activity/i.test(a)
  }
  if (legacy.section === '09' && /forms access|templates exist|template exists|quotes panel|quote exists|quote ready|report exists|report ready|draft report|own template|own quote|own report|reports \+|photos feature/.test(pre)) {
    return !/^upload |^search$|^click row|^⋮ →|^\+ create|^switch tabs|^edit from|^delete|^send |^create\/edit|^templates tab|^create report|^edit in builder/.test(a)
  }
  return false
}

function bootstrapAction(legacy) {
  const pre = legacy.preconditions.toLowerCase()
  if (pre.includes('logged out')) return 'With user logged out, open the app home URL in a fresh tab.'
  if (pre.includes('popup open')) return 'On the map, open a parcel and leave the parcel popup visible.'
  if (pre.includes('details open')) return 'Open Parcel Details for a parcel and leave the overlay visible.'
  if (pre.includes('lists panel') || (legacy.section === '04' && /lists exist|tagged lists|list with|own list|shared list/.test(pre))) {
    return 'Open Menu → Lists and leave the Lists panel visible.'
  }
  if (pre.includes('lead detail')) return 'Open a lead and leave Lead Details visible.'
  if (pre.includes('deal detail') || pre.includes('open deal')) return 'Open a deal and leave Deal Details visible.'
  if (pre.includes('leads panel') || (legacy.section === '05' && /leads exist|tagged leads|leads access/.test(pre))) {
    return 'Open Leads from the action bar (or menu on mobile).'
  }
  if (pre.includes('deals panel') || (legacy.section === '06' && /deals exist|closed deals|pipeline exists/.test(pre))) {
    return 'Open Deals from the action bar.'
  }
  if (pre.includes('tasks panel') || pre.includes('tasks docked') || pre.includes('only tasks') || (legacy.section === '07' && /tasks panel|pipeline tasks|standalone tasks|completed tasks/.test(pre))) {
    return 'Open Tasks from the action bar.'
  }
  if (pre.includes('schedule open') || pre.includes('opened schedule')) return 'Open Schedule from the action bar.'
  if (pre.includes('settings open') || (legacy.section === '08' && pre.includes('settings'))) return 'Open Menu → Settings.'
  if (pre.includes('outreach open') || (legacy.section === '10' && !/pending invite/.test(pre))) return 'Open Menu → Outreach.'
  if (pre.includes('activity open') || pre.includes('activity+tasks') || pre.includes('activity and tasks')) return 'Open Menu → Activity (and Tasks if required by preconditions).'
  if (pre.includes('forms access') || (legacy.section === '09' && /forms|template/.test(pre))) return 'Open Forms panel (action bar on desktop or Menu → Forms on mobile).'
  if (pre.includes('quotes panel') || (legacy.section === '09' && pre.includes('quote'))) return 'Open Quotes panel from the action bar.'
  if (legacy.section === '09' && pre.includes('report')) return 'Open Reports panel (Menu → Reports or action bar).'
  if (legacy.section === '08' && pre.includes('paths exist')) return 'Open Menu → Paths.'
  if (legacy.section === '08' && /activity items|many items/.test(pre)) return 'Open Menu → Activity.'
  if (pre.includes('parcellistpanel') || pre.includes('parcel list')) return 'Open a list with parcels to reach ParcelListPanel.'
  if (pre.includes('hail panel')) return 'Open Hail data from Parcel Details.'
  if (pre.includes('multi-select')) return 'Enable map multi-select mode per preconditions.'
  if (pre.includes('valid ?form=') || pre.includes('valid ?quote=') || pre.includes('valid ?report=')) {
    return `Open the public test URL in a new tab (${legacy.preconditions}).`
  }
  return `Set up preconditions: ${legacy.preconditions}. Navigate to the starting screen for this test.`
}

function bootstrapVerify(legacy) {
  return `Before continuing, visibly confirm these starting conditions: ${legacy.preconditions}. The starting screen is loaded, responsive, and has no blocking error dialog.`
}

export function expandLegacyCase(legacy) {
  const preconditions = expandPreconditions(legacy.preconditions, legacy.viewport, legacy.roles)
  const rawSteps = legacy.steps.flatMap((raw) => expandFlowStep(raw, legacy))
  const steps = []

  if (needsBootstrapStep(rawSteps[0] || '', legacy.preconditions, legacy)) {
    steps.push(step(bootstrapAction(legacy), bootstrapVerify(legacy), inferUi('', legacy)))
  }

  rawSteps.forEach((raw, index) => {
    const action = normalizeAction(raw)
    const isLast = index === rawSteps.length - 1
    const nextAction = isLast ? '' : normalizeAction(rawSteps[index + 1])
    steps.push(
      step(
        action,
        inferVerify(action, legacy, nextAction, isLast),
        inferUi(action, legacy),
      ),
    )
  })

  return tc(
    legacy.id,
    legacy.section,
    legacy.title,
    legacy.roles,
    legacy.viewport,
    preconditions,
    steps,
    legacy.expected,
  )
}
