/** @typedef {string} NavFrameType */

/**
 * @typedef {object} ActivityFrame
 * @property {'activity'} type
 */

/**
 * @typedef {object} ListsFrame
 * @property {'lists'} type
 */

/**
 * @typedef {object} ListsParcelsFrame
 * @property {'lists.parcels'} type
 * @property {string} listId
 */

/**
 * @typedef {object} LeadsFrame
 * @property {'leads'} type
 */

/**
 * @typedef {object} LeadsDetailFrame
 * @property {'leads.detail'} type
 * @property {string} leadId
 */

/**
 * @typedef {object} DealsFrame
 * @property {'deals'} type
 */

/**
 * @typedef {object} DealsDetailFrame
 * @property {'deals.detail'} type
 * @property {string} dealId
 * @property {string} [pipelineId]
 */

/**
 * @typedef {object} DealsClosedFrame
 * @property {'deals.closed'} type
 * @property {string} closedRecordId
 */

/**
 * @typedef {object} DealsLeadFrame
 * @property {'deals.lead'} type
 * @property {string} leadId
 */

/**
 * @typedef {object} PipesFrame
 * @property {'pipes'} type
 * @property {string} [pipelineId]
 */

/**
 * @typedef {object} PipesDealFrame
 * @property {'pipes.deal'} type
 * @property {string} dealId
 */

/**
 * @typedef {object} PipesLeadFrame
 * @property {'pipes.lead'} type
 * @property {string} leadId
 */

/**
 * @typedef {object} TasksFrame
 * @property {'tasks'} type
 */

/**
 * @typedef {object} ScheduleFrame
 * @property {'schedule'} type
 * @property {string} [initialDate]
 */

/**
 * @typedef {object} ScheduleLeadFrame
 * @property {'schedule.lead'} type
 * @property {string} leadId
 */

/**
 * @typedef {object} PathsFrame
 * @property {'paths'} type
 */

/**
 * @typedef {object} FormsFrame
 * @property {'forms'} type
 */

/**
 * @typedef {object} FormsEditFrame
 * @property {'forms.edit'} type
 * @property {string} templateId
 */

/**
 * @typedef {object} FormsFillFrame
 * @property {'forms.fill'} type
 * @property {string} templateId
 */

/**
 * @typedef {object} QuotesFrame
 * @property {'quotes'} type
 * @property {string} [tab]
 */

/**
 * @typedef {object} QuotesEditorFrame
 * @property {'quotes.editor'} type
 * @property {string} [mode]
 * @property {string} [quoteId]
 * @property {string} [templateId]
 * @property {object} [prefill]
 */

/**
 * @typedef {object} QuotesDetailFrame
 * @property {'quotes.detail'} type
 * @property {string} quoteId
 */

/**
 * @typedef {object} TeamsFrame
 * @property {'teams'} type
 */

/**
 * @typedef {object} TeamsDetailFrame
 * @property {'teams.detail'} type
 * @property {string} teamId
 */

/**
 * @typedef {object} SettingsFrame
 * @property {'settings'} type
 */

/**
 * @typedef {object} SkipTracedFrame
 * @property {'skipTraced'} type
 */

/**
 * @typedef {object} OutreachFrame
 * @property {'outreach'} type
 * @property {string} [initialTab]
 */

/**
 * @typedef {object} EmailComposerFrame
 * @property {'emailComposer'} type
 * @property {object} [payload]
 */

/**
 * @typedef {object} BulkEmailPreviewFrame
 * @property {'bulkEmailPreview'} type
 * @property {string} [listId]
 */

/**
 * @typedef {ActivityFrame | ListsFrame | ListsParcelsFrame | LeadsFrame | LeadsDetailFrame |
 *   DealsFrame | DealsDetailFrame | DealsClosedFrame | DealsLeadFrame |
 *   PipesFrame | PipesDealFrame | PipesLeadFrame | TasksFrame | ScheduleFrame | ScheduleLeadFrame |
 *   PathsFrame | FormsFrame | FormsEditFrame | FormsFillFrame |
 *   QuotesFrame | QuotesEditorFrame | QuotesDetailFrame |
 *   TeamsFrame | TeamsDetailFrame | SettingsFrame | SkipTracedFrame |
 *   OutreachFrame | EmailComposerFrame | BulkEmailPreviewFrame} NavFrame
 */

/**
 * @typedef {object} PopupOverlay
 * @property {'popup'} type
 * @property {string} parcelId
 * @property {number} lat
 * @property {number} lng
 * @property {object} popupData
 * @property {object} [parcelData]
 */

/**
 * @typedef {object} ParcelDetailsOverlay
 * @property {'parcelDetails'} type
 * @property {string} parcelId
 * @property {'map' | 'list'} source
 * @property {object} [parcelData]
 */

/**
 * @typedef {object} HailOverlay
 * @property {'hail'} type
 * @property {string} parcelId
 * @property {object} [parcelData]
 */

/**
 * @typedef {object} PhoneOverlay
 * @property {'phone'} type
 * @property {string} phone
 * @property {object} [parcelData]
 */

/** @typedef {PopupOverlay | ParcelDetailsOverlay | HailOverlay | PhoneOverlay} MapOverlayFrame */

/**
 * @typedef {object} LoginModal
 * @property {'login'} type
 */

/**
 * @typedef {object} SignUpModal
 * @property {'signup'} type
 */

/**
 * @typedef {object} ForgotPasswordModal
 * @property {'forgotPassword'} type
 */

/**
 * @typedef {object} CreateLeadModal
 * @property {'createLead'} type
 * @property {object} [prefill]
 */

/**
 * @typedef {object} CreateDealModal
 * @property {'createDeal'} type
 * @property {object} [prefill]
 */

/**
 * @typedef {object} DealTemplatePickerModal
 * @property {'dealTemplatePicker'} type
 * @property {object} [prefill]
 */

/**
 * @typedef {object} DealTemplateEditorModal
 * @property {'dealTemplateEditor'} type
 * @property {string} [templateId]
 */

/**
 * @typedef {object} DealTemplatesManagerModal
 * @property {'dealTemplatesManager'} type
 */

/**
 * @typedef {object} MoveDealModal
 * @property {'moveDeal'} type
 * @property {object} context
 */

/**
 * @typedef {object} ConvertToLeadPipelineModal
 * @property {'convertToLeadPipeline'} type
 * @property {object} [context]
 */

/** @typedef {LoginModal | SignUpModal | ForgotPasswordModal | CreateLeadModal | CreateDealModal |
 *   DealTemplatePickerModal | DealTemplateEditorModal | DealTemplatesManagerModal |
 *   MoveDealModal | ConvertToLeadPipelineModal} ModalFrame */

/** Root panel types (no dot suffix). */
export const ROOT_PANEL_TYPES = new Set([
  'activity',
  'lists',
  'leads',
  'deals',
  'pipes',
  'tasks',
  'schedule',
  'paths',
  'forms',
  'quotes',
  'teams',
  'settings',
  'skipTraced',
  'outreach',
  'emailComposer',
  'bulkEmailPreview',
])

/** Panels that can sit under a stacked schedule overlay. */
export const STACKABLE_SCHEDULE_OPENERS = new Set(['leads', 'deals', 'tasks', 'pipes'])

/** Returns root segment of a frame type (e.g. 'leads.detail' → 'leads'). */
export function frameRoot(type) {
  return type.split('.')[0]
}

/** True when frame is a nested child (detail, editor, etc.). */
export function isNestedChildFrame(type) {
  return type.includes('.') && type !== 'lists.parcels'
    ? true
    : type === 'lists.parcels'
}

export const NAV_ACTIONS = {
  PUSH: 'PUSH',
  POP: 'POP',
  REPLACE_STACK: 'REPLACE_STACK',
  RESET_TO_MAP: 'RESET_TO_MAP',
  PUSH_OVERLAY: 'PUSH_OVERLAY',
  POP_OVERLAY: 'POP_OVERLAY',
  REPLACE_OVERLAY: 'REPLACE_OVERLAY',
  CLEAR_OVERLAYS: 'CLEAR_OVERLAYS',
  PUSH_MODAL: 'PUSH_MODAL',
  POP_MODAL: 'POP_MODAL',
  REPLACE_MODALS: 'REPLACE_MODALS',
  SET_META: 'SET_META',
  PATCH_TOP_OVERLAY: 'PATCH_TOP_OVERLAY',
  PATCH_NAV_FRAME: 'PATCH_NAV_FRAME',
  /** Close parcel details + hail panels; keep popup / other overlays (storm map view). */
  DISMISS_PARCEL_HAIL_PANELS: 'DISMISS_PARCEL_HAIL_PANELS',
}

export function createInitialState() {
  return {
    navStack: [],
    mapOverlayStack: [],
    modalStack: [],
    meta: { showMenu: false },
  }
}
