import { ArrowLeft } from 'lucide-react'
import { returnToAppFromClientPreview } from '@/utils/clientPreview'

export function PublicOwnerPreviewBackBar() {
  return (
    <div
      className="public-owner-preview-back sticky top-0 z-50 flex items-center border-b border-blue-200 bg-blue-600 text-white shadow-sm"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <button
        type="button"
        onClick={() => returnToAppFromClientPreview()}
        className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2.5 text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors touch-manipulation"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        Back to app
      </button>
    </div>
  )
}
