# Navigation Router

Central navigation for the property list builder app. Replaces scattered `is*Open` booleans, activity/schedule refs, and per-panel overlay state with three typed stacks.

## Stacks

| Stack | Purpose |
|-------|---------|
| `navStack` | Primary panel routes (bottom → top; leaf = active screen) |
| `mapOverlayStack` | Map popup, parcel details, hail, phone |
| `modalStack` | Auth, create-lead/deal, template dialogs |

Non-route UI context (e.g. `showMenu`, `activePipelineId`) stays in `App.jsx`.

## Frame catalog

Root panels: `activity`, `lists`, `leads`, `deals`, `pipes`, `tasks`, `schedule`, `paths`, `forms`, `quotes`, `teams`, `settings`, `skipTraced`, `outreach`, `emailComposer`.

Nested frames use dot notation, e.g. `leads.detail`, `pipes.deal`, `schedule.lead`, `forms.edit`, `quotes.editor`.

Map overlays: `popup`, `parcelDetails`, `hail`, `phone`.

## API

```jsx
const nav = useNavigation()
const pp = nav.panelProps  // derived panel flags + overlay/modal state

nav.push({ type: 'leads.detail', leadId })
nav.pop()                    // unified back (see reducer)
nav.replaceStack([...])      // menu mutual exclusion
nav.resetToMapFullState()    // close all panels + overlays + modals

nav.openLeads()
nav.navigateFromFeed(data, ctx)
nav.navigateFromActivity(data, ctx)
nav.openScheduleAtDate(ts)

nav.showParcelPopup(overlay)
nav.openParcelDetails(overlay)
nav.openHailOverlay(overlay)
nav.popMapOverlay()

nav.pushModal({ type: 'createLead', prefill })
nav.popModal()
```

## push vs replaceStack

- **Menu navigation** → `replaceStack` via recipes in `recipes.js` (closes other primary panels).
- **Drill-down within a panel** → `push` (e.g. leads list → lead detail).
- **Settings from menu** → `push` (stacks on top of current panel).
- **Activity feed** → `replaceStack` with activity root frame prepended.

## Back resolution (`navigationReducer.popNavStack`)

1. Pop nested child frame (e.g. `leads.detail`).
2. `schedule.lead` → pop to `schedule`.
3. `schedule` with opener below → pop schedule only.
4. Activity-origin root destination → pop to expose activity.
5. Default → pop top frame.

Panels call `nav.pop()` from header back buttons; local overlay state is owned by the stack.

## Adding a new panel

1. Add frame type(s) to `types.js`.
2. Extend `selectors.js` with `is*Open` and any detail-frame props.
3. Add open recipe to `recipes.js` (link to legacy behavior in a comment).
4. Add reducer test in `__tests__/navigationReducer.test.js`.
5. Wire `NavigationContext` helper if needed.
6. Read props from `nav.panelProps` in `App.jsx`; pass `onBack={() => nav.pop()}`.

## Tests

```bash
npm test
```

Reducer tests cover feed routing, menu recipes, schedule stacking, activity back, and map overlay push/pop.
