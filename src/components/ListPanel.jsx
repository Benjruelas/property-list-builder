import { useState, useEffect } from 'react'
import { X, RefreshCw, Plus, Eye, Trash2, Lock, Globe, Check } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'
import { showConfirm } from './ui/confirm-dialog'
import { createPublicList, fetchPublicLists } from '../utils/publicLists'

const STORAGE_KEY = 'property_lists'

export function ListPanel({ 
  isOpen, 
  onClose, 
  selectedListId,
  onSelectList,
  onDeselectList,
  onAddParcelsToList,
  selectedParcelsCount,
  publicLists: publicListsProp,
  onPublicListsChange,
  onDeletePublicList,
  onViewListContents,
  isAddingSingleParcel = false
}) {
  const [privateLists, setPrivateLists] = useState([])
  const [newListName, setNewListName] = useState('')
  const [newListIsPublic, setNewListIsPublic] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  // Local optimistic state for public lists (includes newly created lists before refresh)
  const [optimisticPublicLists, setOptimisticPublicLists] = useState([])
  
  // Merge prop-based public lists with optimistic ones
  const publicLists = [...(publicListsProp || []), ...optimisticPublicLists].filter((list, index, self) => 
    index === self.findIndex(l => l.id === list.id)
  )

  // Load private lists from localStorage
  const loadPrivateLists = () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // Filter to only include private lists (those without isPublic flag or isPublic=false)
        setPrivateLists(parsed.filter(list => !list.isPublic))
      } catch (error) {
        console.error('Error loading private lists:', error)
        setPrivateLists([])
      }
    } else {
      setPrivateLists([])
    }
  }

  useEffect(() => {
    loadPrivateLists()
    // Refresh lists when panel opens
    if (isOpen) {
      loadPrivateLists()
      // Refresh public lists when panel opens
      if (onPublicListsChange) {
        onPublicListsChange()
      }
      // Clear optimistic lists when panel closes/opens (they should be in props by now)
      setOptimisticPublicLists([])
    }
  }, [isOpen, onPublicListsChange])

  // Debug: Log when publicLists prop changes
  useEffect(() => {
    console.log('ListPanel: publicLists prop changed:', publicLists?.length || 0, 'lists')
  }, [publicLists])

  // Save private lists to localStorage
  const savePrivateLists = (updatedLists) => {
    setPrivateLists(updatedLists)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLists))
  }

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      showToast('Please enter a list name', 'error')
      return
    }

    setIsCreating(true)

    try {
      if (newListIsPublic) {
        // Create public list via API
        console.log('Creating public list:', newListName.trim())
        const newList = await createPublicList(newListName.trim(), [])
        console.log('Public list created:', newList)
        
        // Optimistically add the list to local state so it appears immediately
        setOptimisticPublicLists(prev => [...prev, newList])
        
        // Clear form
        setNewListName('')
        setNewListIsPublic(false)
        setShowCreateForm(false)
        
        // Refresh from server after a delay to sync with server state
        // This handles the case where the list was created successfully
        if (onPublicListsChange) {
          console.log('Scheduling refresh of public lists...')
          setTimeout(async () => {
            await onPublicListsChange()
            // Clear optimistic state after refresh (the list should now be in props)
            setOptimisticPublicLists(prev => prev.filter(l => l.id !== newList.id))
            console.log('Public lists refreshed from server')
          }, 1000)
        }
        
        console.log('List creation completed, showing optimistically')
      } else {
        // Create private list in localStorage
        const newList = {
          id: `private_${Date.now()}`,
          name: newListName.trim(),
          parcels: [],
          isPublic: false,
          createdAt: new Date().toISOString()
        }

        const updatedLists = [...privateLists, newList]
        savePrivateLists(updatedLists)
            setNewListName('')
            setNewListIsPublic(false)
            setShowCreateForm(false)
            
            showToast(`Private list "${newList.name}" created successfully!`, 'success')
          }
        } catch (error) {
          console.error('Error creating list:', error)
          showToast(`Failed to create list: ${error.message}`, 'error')
        } finally {
          setIsCreating(false)
        }
      }

  const handleDeleteList = async (listId, isPublic) => {
    if (isPublic) {
      // Delete public list via callback
      if (onDeletePublicList) {
        onDeletePublicList(listId)
      }
    } else {
      // Delete private list
      const confirmed = await showConfirm(
        'Are you sure you want to delete this list?',
        'Delete List'
      )
      if (!confirmed) return
      
      const updatedLists = privateLists.filter(list => list.id !== listId)
      savePrivateLists(updatedLists)
      if (selectedListId === listId) {
        onDeselectList()
      }
      showToast('List deleted successfully', 'success')
    }
  }

  // Combine private and public lists for display
  // Use the publicLists prop directly - it should be updated by parent
  const allLists = [...privateLists, ...(publicLists || [])]
  
  const handleSelectList = (listId) => {
    if (selectedListId === listId) {
      onDeselectList()
    } else {
      onSelectList(listId)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose()
      }
    }}>
      <DialogContent className="max-w-md max-h-[80vh] p-0" showCloseButton={false}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">Property Lists</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  loadPrivateLists()
                  if (onPublicListsChange) {
                    onPublicListsChange()
                  }
                }}
                title="Refresh lists"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-200px)]">
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
              <div className="flex gap-3">
                <label className="flex-1 flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="listType"
                    checked={!newListIsPublic}
                    onChange={() => setNewListIsPublic(false)}
                    disabled={isCreating}
                    className="w-4 h-4"
                  />
                  <Lock className="h-4 w-4" />
                  <span className="text-sm">Private</span>
                </label>
                <label className="flex-1 flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="listType"
                    checked={newListIsPublic}
                    onChange={() => setNewListIsPublic(true)}
                    disabled={isCreating}
                    className="w-4 h-4"
                  />
                  <Globe className="h-4 w-4" />
                  <span className="text-sm">Public</span>
                </label>
              </div>
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
                    setNewListIsPublic(false)
                  }}
                  disabled={isCreating}
                  variant="outline"
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
              <>
                {privateLists.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 pb-2 border-b">
                      <Lock className="h-4 w-4" />
                      Private Lists
                    </h3>
                    {privateLists.map(list => (
                      <div 
                        key={list.id} 
                        className={cn(
                          "flex items-center justify-between p-3 border-2 rounded-lg transition-all cursor-pointer",
                          selectedListId === list.id 
                            ? "border-blue-500 bg-blue-50 shadow-md" 
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        )}
                        onClick={() => {
                          if (isAddingSingleParcel) {
                            // In single parcel mode, clicking the list adds the parcel
                            onAddParcelsToList(list.id, false)
                          } else {
                            // Normal mode: toggle selection
                            handleSelectList(list.id)
                          }
                        }}
                        title={
                          isAddingSingleParcel 
                            ? "Click to add parcel to this list" 
                            : selectedListId === list.id 
                              ? "Click to deselect and remove highlighting" 
                              : "Click to select and highlight parcels"
                        }
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {selectedListId === list.id && !isAddingSingleParcel && (
                              <Check className="h-4 w-4 text-blue-600" />
                            )}
                            <span className={cn(
                              "font-medium text-sm truncate",
                              selectedListId === list.id && !isAddingSingleParcel && "text-blue-900"
                            )}>
                              {list.name}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">{list.parcels.length} parcels</span>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          {!isAddingSingleParcel && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (onViewListContents) {
                                  onViewListContents(list.id)
                                }
                              }}
                              title="View list contents"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {!isAddingSingleParcel && selectedParcelsCount > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                onAddParcelsToList(list.id, false)
                              }}
                              title="Add selected parcels to this list"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                          {!isAddingSingleParcel && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteList(list.id, false)
                              }}
                              title="Delete list"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(publicLists && publicLists.length > 0) && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 pb-2 border-b">
                      <Globe className="h-4 w-4" />
                      Public Lists ({publicLists.length})
                    </h3>
                    {publicLists.map(list => (
                      <div 
                        key={list.id} 
                        className={cn(
                          "flex items-center justify-between p-3 border-2 rounded-lg transition-all cursor-pointer",
                          selectedListId === list.id 
                            ? "border-blue-500 bg-blue-50 shadow-md" 
                            : "border-green-200 bg-green-50/50 hover:border-green-300 hover:bg-green-50"
                        )}
                        onClick={() => {
                          if (isAddingSingleParcel) {
                            // In single parcel mode, clicking the list adds the parcel
                            onAddParcelsToList(list.id, true)
                          } else {
                            // Normal mode: toggle selection
                            handleSelectList(list.id)
                          }
                        }}
                        title={
                          isAddingSingleParcel 
                            ? "Click to add parcel to this list" 
                            : selectedListId === list.id 
                              ? "Click to deselect and remove highlighting" 
                              : "Click to select and highlight parcels"
                        }
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {selectedListId === list.id && !isAddingSingleParcel && (
                              <Check className="h-4 w-4 text-blue-600" />
                            )}
                            <span className={cn(
                              "font-medium text-sm truncate",
                              selectedListId === list.id && !isAddingSingleParcel && "text-blue-900"
                            )}>
                              {list.name}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">{list.parcels.length} parcels</span>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          {!isAddingSingleParcel && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (onViewListContents) {
                                  onViewListContents(list.id)
                                }
                              }}
                              title="View list contents"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {!isAddingSingleParcel && selectedParcelsCount > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                onAddParcelsToList(list.id, true)
                              }}
                              title="Add selected parcels to this list"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                          {!isAddingSingleParcel && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteList(list.id, true)
                              }}
                              title="Delete public list"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

