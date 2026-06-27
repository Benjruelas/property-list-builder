import { useState } from 'react'
import { Eye } from 'lucide-react'
import { fetchClientPreviewUrl, prepareClientPreviewTab, closeClientPreviewTab, openClientPreviewUrl } from '@/utils/clientPreview'
import { showToast } from './ui/toast'
import { PanelActionButton } from './ui/panel-action-button'

/**
 * Branded "View as client" link for quote/report detail panels.
 * Fetches the public URL on click so failed previews do not spam the console on open.
 */
export function ViewAsClientButton({
  getToken,
  type,
  entityId,
  disabled = false,
}) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (disabled || loading || !entityId) return
    const previewWindow = prepareClientPreviewTab()
    if (!previewWindow) {
      showToast('Allow popups to open the client preview', 'error')
      return
    }
    setLoading(true)
    try {
      const url = await fetchClientPreviewUrl(getToken, { type, id: entityId })
      if (!openClientPreviewUrl(url, previewWindow)) {
        closeClientPreviewTab(previewWindow)
        showToast('Could not open client preview tab', 'error')
      }
    } catch (e) {
      closeClientPreviewTab(previewWindow)
      showToast(e.message || 'Could not load client preview link', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PanelActionButton disabled={disabled || loading || !entityId} onClick={handleClick}>
      <Eye className="h-4 w-4 shrink-0" />
      View as client
    </PanelActionButton>
  )
}
