import { FileText, Plus } from 'lucide-react'
import { Button } from '../ui/button'

export function NotesSection({ data, compact = false }) {
  const { note, setNote, isEditingNote, setIsEditingNote, handleSaveNote, handleCancelNote } = data

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <span>Notes</span>
        </div>
        {!isEditingNote && (
          <Button variant="outline" size="icon" onClick={() => setIsEditingNote(true)} className="add-note-btn rounded-xl border-2" title={note ? 'Edit note' : 'Add note'}>
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isEditingNote ? (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add your notes about this parcel..."
            className="w-full min-h-[100px] p-3 rounded-xl resize-y focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:ring-offset-0"
            rows={compact ? 3 : 4}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={handleCancelNote} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white/80 bg-white/10 border border-white/20 hover:bg-white/20 transition-colors">Cancel</button>
            <button onClick={handleSaveNote} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors">Save</button>
          </div>
        </div>
      ) : (
        <div className="py-2">
          {note ? <p className="text-gray-900 whitespace-pre-wrap">{note}</p> : <p className="text-gray-400 italic">No notes added yet.</p>}
        </div>
      )}
    </div>
  )
}
