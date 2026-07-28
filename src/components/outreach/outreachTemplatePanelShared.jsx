/**
 * Outreach template panels — same shell as deal/quote template pickers.
 */
export {
  DealTemplatePanelShell as OutreachTemplatePanelShell,
  DealTemplatePanelScroll as OutreachTemplateFormBody,
  DEAL_TEMPLATE_SAFE_BODY_STYLE as OUTREACH_TEMPLATE_BODY_STYLE,
  DEAL_TEMPLATE_PANEL_CLASS as OUTREACH_TEMPLATE_PANEL_CLASS,
} from '../dealTemplates/dealTemplatePanelShared'

export function OutreachTemplateFormFooter({ children }) {
  return (
    <div className="outreach-template-form-footer flex-shrink-0 flex gap-2 px-5 py-4 border-t border-white/10">
      {children}
    </div>
  )
}
