import { forwardRef } from 'react'
import { MessageTagEditor } from '../shared/MessageTagEditor'
import { QUOTE_SEND_TAGS, getQuoteTagPillText } from '../../utils/quoteSendTemplates'

/** Quote send wrapper around shared MessageTagEditor. */
export const QuoteMessageTagEditor = forwardRef(function QuoteMessageTagEditor(props, ref) {
  return (
    <MessageTagEditor
      ref={ref}
      tags={QUOTE_SEND_TAGS}
      getPillText={(key, data) => getQuoteTagPillText(key, data)}
      {...props}
    />
  )
})
