import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, RefreshCw, Plus, Eye, Trash2, Check, Phone, Mail, MoreVertical, FileDown, Share2 } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'
import { Input } from './ui/input'

const LIST_HIGHLIGHT_COLORS = [
  '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626',
  '#0d9488', '#db2777', '#4f46e5', '#d97706', '#65a30d',
  '#0891b2', '#e11d48', '#7c3aed', '#059669', '#0284c7',
  '#c026d3', '#b45309', '#1d4ed8', '#15803d', '#be185d',
]
const MAX_HIGHLIGHTED_LISTS = 20

export function ListPanel({ 
  isOpen, 
  onClose, 
  selectedListIds = [],
  onToggleListHighlight,
  onAddParcelsToList,
  selectedParcelsCount,
  lists = [],
  onListsChange,
  onDeleteList,
  onShareList,
  onCreateList,
  onViewListContents,
  onBulkSkipTrace,
  onBulkEmail,
  onExportList,
  isAddingSingleParcel = false,
  isBulkEmailMode = false
}) {
  const [newListName, setNewListName] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [openDropdownListId, setOpenDropdownListId] = useState(null)
  const [dropdownAnchor, setDropdownAnchor] = useState(null) // { bottom, right } for portal positioning
  const [shareListId, setShareListId] = useState(null)
  const [shareEmail, setShareEmail] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setOpenDropdownListId(null)
      setDropdownAnchor(null)
      setShareListId(null)
      setShareEmail('')
    }
  }, [isOpen])

  const MENU_WIDTH = 180
  const MENU_PADDING = 8
  const openDropdown = (listId, event) => {
    event.stopPropagation()
    const el = event.currentTarget
    const rect = el.getBoundingClientRect()
    let top = rect.bottom + 4
    let left = rect.right - MENU_WIDTH
    if (left < MENU_PADDING) left = MENU_PADDING
    if (left + MENU_WIDTH > window.innerWidth - MENU_PADDING) left = window.innerWidth - MENU_WIDTH - MENU_PADDING
    const menuHeight = 320
    if (top + menuHeight > window.innerHeight - MENU_PADDING) top = Math.max(MENU_PADDING, rect.top - menuHeight - 4)
    setDropdownAnchor({ top, left })
    setOpenDropdownListId(listId)
  }

  const closeDropdown = () => {
    setOpenDropdownListId(null)
    setDropdownAnchor(null)
  }

  useEffect(() => {
    if (isOpen && onListsChange) onListsChange()
  }, [isOpen, onListsChange])

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      showToast('Please enter a list name', 'error')
      return
    }
    setIsCreating(true)
    try {
      if (onCreateList) await onCreateList(newListName.trim())
      setNewListName('')
      setShowCreateForm(false)
      showToast('List created', 'success')
    } catch (error) {
      showToast(error.message || 'Failed to create list', 'error')
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteListClick = (listId) => {
    if (onDeleteList) onDeleteList(listId)
  }

  const handleShareSave = () => {
    if (!shareListId || !onShareList) return
    const email = shareEmail.trim()
    if (!email) {
      showToast('Please enter an email', 'error')
      return
    }
    onShareList(shareListId, [email])
    setShareListId(null)
    setShareEmail('')
  }

  const handleUnshareList = () => {
    if (!shareListId || !onShareList) return
    onShareList(shareListId, [])
    setShareListId(null)
    setShareEmail('')
  }

  const allLists = lists || []
  
  const handleToggleHighlight = (listId) => {
    if (!onToggleListHighlight) return
    if (selectedListIds.includes(listId)) {
      onToggleListHighlight(listId)
    } else if (selectedListIds.length >= MAX_HIGHLIGHTED_LISTS) {
      showToast(`Maximum ${MAX_HIGHLIGHTED_LISTS} lists can be highlighted. Remove one to add another.`, 'warning')
    } else {
      onToggleListHighlight(listId)
    }
  }

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose()
      }
    }}>
      <DialogContent
        className="map-panel list-panel max-w-md max-h-[80vh] p-0"
        showCloseButton={false}
        hideOverlay
        onInteractOutside={(e) => {
          if (e.target.closest?.('[data-list-panel-dropdown]')) e.preventDefault()
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogDescription className="sr-only">Manage your property lists, add parcels, and share lists</DialogDescription>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">Property Lists</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onListsChange?.()}
                title="Refresh lists"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto scrollbar-hide max-h-[calc(80vh-200px)]">
          {isAddingSingleParcel && (
            <div className="mb-4 p-3 bg-blue-50 text-blue-900 rounded-lg text-sm font-medium text-center">
              Select a list to add this parcel to
            </div>
          )}
          {!isAddingSingleParcel && selectedParcelsCount > 0 && (
            <div className="mb-4 p-3 bg-blue-50 text-blue-900 rounded-lg text-sm font-medium text-center">
              {selectedParcelsCount} parcel{selectedParcelsCount !== 1 ? 's' : ''} selected
            </div>
          )}
          {!isAddingSingleParcel && selectedParcelsCount === 0 && isBulkEmailMode && (
            <div className="mb-4 p-3 bg-green-50 text-green-900 rounded-lg text-sm font-medium text-center">
              Select a list to send emails to
            </div>
          )}
          {!showCreateForm ? (
            <Button 
              onClick={() => setShowCreateForm(true)}
              className="w-full mb-4"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New List
            </Button>
          ) : (
            <div className="mb-4 space-y-3">
              <input
                type="text"
                placeholder="List name"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleCreateList()}
                autoFocus
                disabled={isCreating}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <Button 
                  onClick={handleCreateList}
                  disabled={isCreating}
                  className="flex-1"
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </Button>
                <Button 
                  onClick={() => {
                    setShowCreateForm(false)
                    setNewListName('')
                  }}
                  disabled={isCreating}
                  variant="ghost"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {allLists.length === 0 ? (
              <p className="text-center text-gray-500 py-8 text-sm">No lists yet. Create one to get started!</p>
            ) : (
              <div className="space-y-2">
                {allLists.map(list => {
                      const isSelected = selectedListIds.includes(list.id)
                      const listColorIndex = isSelected ? selectedListIds.indexOf(list.id) : -1
                      const listColor = listColorIndex >= 0 ? LIST_HIGHLIGHT_COLORS[listColorIndex] : undefined
                      return (
                      <div 
                        key={list.id} 
                        className={cn(
                          "flex items-center justify-between p-3 border-2 rounded-lg transition-all",
                          isSelected 
                            ? "" 
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                          !isAddingSingleParcel && !isBulkEmailMode && (list.parcels?.length ?? 0) === 0
                            ? "cursor-not-allowed opacity-75"
                            : "cursor-pointer"
                        )}
                        style={isSelected ? {
                          borderColor: listColor ?? LIST_HIGHLIGHT_COLORS[0],
                          backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        } : undefined}
                        onClick={(e) => {
                          if (isAddingSingleParcel) {
                            onAddParcelsToList(list.id)
                          } else if (isBulkEmailMode) {
                            e.stopPropagation()
                            onAddParcelsToList(list.id)
                          } else {
                            const parcelCount = list.parcels?.length ?? 0
                            if (parcelCount > 0 && onViewListContents) onViewListContents(list.id)
                          }
                        }}
                        title={
                          isAddingSingleParcel 
                            ? "Click to add parcel to this list" 
                            : isBulkEmailMode
                            ? "Click to send emails to this list"
                            : (list.parcels?.length ?? 0) > 0
                            ? "Click to view list contents"
                            : "List is empty"
                        }
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isSelected && !isAddingSingleParcel && (
                              <span 
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: LIST_HIGHLIGHT_COLORS[selectedListIds.indexOf(list.id)] }}
                                title={`Color ${selectedListIds.indexOf(list.id) + 1}`}
                              />
                            )}
                            <span className="font-medium text-sm truncate">
                              {list.name}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">{list.parcels?.length ?? 0} parcels</span>
                        </div>
                        <div className="relative ml-2 flex items-center gap-1">
                          {!isAddingSingleParcel && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggleHighlight(list.id)
                                }}
                                title={isSelected ? "Remove highlight" : "Highlight on map"}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-8 w-8",
                                  openDropdownListId === list.id && "opacity-90"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openDropdownListId === list.id ? closeDropdown() : openDropdown(list.id, e)
                                }}
                                title="List options"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </div>
                )}
              </div>
        </div>
      </DialogContent>
    </Dialog>

    {shareListId && (
      <Dialog open={!!shareListId} onOpenChange={(open) => { if (!open) { setShareListId(null); setShareEmail('') } }}>
        <DialogContent className="map-panel list-panel max-w-sm" focusOverlay>
          <DialogHeader>
            <DialogTitle>Share list</DialogTitle>
            <DialogDescription className="sr-only">Enter an email address to share this list</DialogDescription>
          </DialogHeader>
          {(() => {
            const list = allLists.find((l) => l.id === shareListId)
            const currentShared = list?.sharedWith || []
            const isShared = currentShared.length > 0
            return (
              <>
                {isShared && (
                  <p className="text-sm text-gray-600 mb-2">
                    Currently shared with: {currentShared.join(', ')}
                  </p>
                )}
                <Input
                  type="email"
                  placeholder="Email to share with"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  className="mb-4"
                />
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={handleShareSave} className="flex-1 min-w-0">
                    {isShared ? 'Update' : 'Save'}
                  </Button>
                  {isShared && (
                    <Button variant="outline" onClick={handleUnshareList} className="text-red-600 hover:text-red-700">
                      Unshare
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => { setShareListId(null); setShareEmail('') }}>Cancel</Button>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    )}

    {openDropdownListId && dropdownAnchor && typeof document !== 'undefined' && createPortal(
      (() => {
        const list = allLists.find(l => l.id === openDropdownListId)
        if (!list) return null
        return (
          <div data-list-panel-dropdown className="pointer-events-auto" style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
            <div className="fixed inset-0 z-[10001]" onClick={closeDropdown} aria-hidden />
            <div
              className="map-panel list-panel fixed z-[10002] rounded-xl min-w-[180px] py-1"
              style={{ top: dropdownAnchor.top, left: dropdownAnchor.left }}
              role="menu"
              onClick={(e) => e.stopPropagation()}
            >
              {selectedParcelsCount > 0 && (
                <button type="button" onClick={() => { closeDropdown(); onAddParcelsToList(list.id) }} className="w-full px-3 py-2 text-left text-sm text-green-700 flex items-center gap-2 transition-colors">
                  <Plus className="h-4 w-4 flex-shrink-0" />
                  Add selected parcels
                </button>
              )}
              {onBulkEmail && list.parcels?.length > 0 && (
                <button type="button" onClick={() => { closeDropdown(); onBulkEmail(list.id) }} className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors">
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  Email list
                </button>
              )}
              {onBulkSkipTrace && list.parcels?.length > 0 && (
                <button type="button" onClick={() => { closeDropdown(); onBulkSkipTrace(list.id) }} className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors">
                  <Phone className="h-4 w-4 flex-shrink-0" />
                  Skip trace list
                </button>
              )}
              {onExportList && (
                <button type="button" onClick={() => { closeDropdown(); onExportList(list.id) }} className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors">
                  <FileDown className="h-4 w-4 flex-shrink-0" />
                  Export list
                </button>
              )}
              {onShareList && (
                <button type="button" onClick={() => { closeDropdown(); setShareListId(list.id); setShareEmail((list.sharedWith || [])[0] || '') }} className="w-full px-3 py-2 text-left text-sm text-gray-900 flex items-center gap-2 transition-colors">
                  <Share2 className="h-4 w-4 flex-shrink-0" />
                  Share list
                </button>
              )}
              <button type="button" onClick={() => { closeDropdown(); handleDeleteListClick(list.id) }} className="w-full px-3 py-2 text-left text-sm text-red-600 flex items-center gap-2 transition-colors">
                <Trash2 className="h-4 w-4 flex-shrink-0" />
                Delete list
              </button>
            </div>
          </div>
        )
      })(),
      document.getElementById('modal-root') || document.body
    )}
    </>
  )
}

