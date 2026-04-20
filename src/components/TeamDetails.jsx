import { useState } from 'react'
import { X, UserPlus, Trash2, LogOut, Pencil, Shield, ArrowRightLeft } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'
import {
  addTeamMember,
  removeTeamMember,
  renameTeam,
  deleteTeam,
  transferTeamOwnership,
  teamRoleForUser
} from '@/utils/teams'

export function TeamDetails({ team, currentUser, getToken, onClose, onTeamsChange }) {
  const [addEmail, setAddEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(team.name || '')
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [transferTarget, setTransferTarget] = useState(null)

  const role = teamRoleForUser(team, currentUser)
  const isOwner = role === 'owner'

  const refresh = async () => { if (onTeamsChange) await onTeamsChange() }

  const handleAddMember = async () => {
    const email = addEmail.trim().toLowerCase()
    if (!email) { showToast('Enter an email', 'error'); return }
    setAdding(true)
    try {
      await addTeamMember(getToken, team.id, email)
      setAddEmail('')
      showToast('Member added', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Failed to add member', 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveMember = async (uid, isSelf) => {
    const label = isSelf ? 'leave' : 'remove'
    if (!window.confirm(`Are you sure you want to ${label} this team?`)) return
    setBusy(true)
    try {
      await removeTeamMember(getToken, team.id, uid)
      showToast(isSelf ? 'Left team' : 'Member removed', 'success')
      await refresh()
      if (isSelf) onClose()
    } catch (e) {
      showToast(e.message || 'Failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleRename = async () => {
    const v = renameValue.trim()
    if (!v) { showToast('Name required', 'error'); return }
    setBusy(true)
    try {
      await renameTeam(getToken, team.id, v)
      setRenaming(false)
      showToast('Team renamed', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Failed to rename', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    setBusy(true)
    try {
      await deleteTeam(getToken, team.id)
      showToast('Team deleted', 'success')
      await refresh()
      onClose()
    } catch (e) {
      showToast(e.message || 'Failed to delete team', 'error')
    } finally {
      setBusy(false)
      setConfirmingDelete(false)
    }
  }

  const handleTransfer = async () => {
    if (!transferTarget) return
    if (!window.confirm(`Transfer ownership to ${transferTarget.email}? You will become a regular member and lose admin controls.`)) return
    setBusy(true)
    try {
      await transferTeamOwnership(getToken, team.id, transferTarget.uid)
      showToast('Ownership transferred', 'success')
      await refresh()
      setTransferTarget(null)
    } catch (e) {
      showToast(e.message || 'Failed to transfer', 'error')
    } finally {
      setBusy(false)
    }
  }

  const members = team.members || []
  const seatCount = members.length
  const seatLimit = team.seatLimit || 10

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="map-panel list-panel fullscreen-panel"
        showCloseButton={false}
        hideOverlay
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/20 text-left" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
          <DialogDescription className="sr-only">Team details, members, and settings</DialogDescription>
          <div className="map-panel-header-toolbar">
            <div className="map-panel-header-title-wrap flex-1 min-w-0">
              {renaming && isOwner ? (
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename()
                      if (e.key === 'Escape') { setRenaming(false); setRenameValue(team.name || '') }
                    }}
                    maxLength={80}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleRename} disabled={busy}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => { setRenaming(false); setRenameValue(team.name || '') }}>Cancel</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-left text-xl font-semibold truncate">{team.name}</DialogTitle>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Rename team"
                      onClick={() => setRenaming(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="map-panel-header-actions gap-2">
              <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div
          className="px-6 py-4 overflow-y-auto scrollbar-hide flex-1"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="mb-4 flex items-center gap-2 text-xs text-gray-400">
            <Shield className="h-3.5 w-3.5" />
            <span>
              {seatCount}/{seatLimit} seats used · {isOwner ? 'You are the owner' : `Owned by ${team.ownerEmail || 'unknown'}`}
            </span>
          </div>

          {/* Add member */}
          {isOwner && (
            <div className="mb-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Add member</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
                  placeholder="user@example.com"
                  disabled={adding || seatCount >= seatLimit}
                  className="flex-1"
                />
                <Button
                  onClick={handleAddMember}
                  disabled={adding || !addEmail.trim() || seatCount >= seatLimit}
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  {adding ? 'Adding...' : 'Add'}
                </Button>
              </div>
              {seatCount >= seatLimit && (
                <p className="text-xs text-amber-500 mt-1">Seat limit reached. Remove a member to add another.</p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                The user must already have an account in the app. If you hit "must sign up first", have them register, create at least one list or pipe, then try again.
              </p>
            </div>
          )}

          {/* Members */}
          <div className="mb-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Members</p>
            <ul className="space-y-1.5">
              {members.map((m) => {
                const isSelf = m.uid === currentUser?.uid
                const isTheOwner = m.role === 'owner' || m.uid === team.ownerId
                return (
                  <li
                    key={m.uid}
                    className="group flex items-center justify-between gap-2 py-2 px-3 rounded-md bg-black/10"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-200 truncate">{m.email || m.uid}</span>
                        {isSelf && (
                          <span className="text-[10px] text-gray-400">(you)</span>
                        )}
                        {isTheOwner && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/40 uppercase tracking-wide">
                            Owner
                          </span>
                        )}
                      </div>
                      {m.addedAt && !isTheOwner && (
                        <p className="text-[11px] text-gray-500">Joined {new Date(m.addedAt).toLocaleDateString()}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isOwner && !isTheOwner && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Transfer ownership to this member"
                          onClick={() => setTransferTarget(m)}
                          disabled={busy}
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {(isOwner && !isTheOwner) || (isSelf && !isTheOwner) ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-300"
                          title={isSelf ? 'Leave team' : 'Remove member'}
                          onClick={() => handleRemoveMember(m.uid, isSelf)}
                          disabled={busy}
                        >
                          {isSelf ? <LogOut className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Delete team (owner) */}
          {isOwner && (
            <div className="pt-4 border-t border-white/10">
              {confirmingDelete ? (
                <div className="rounded-md bg-red-900/20 border border-red-500/30 p-3">
                  <p className="text-sm text-red-200 mb-2">
                    Delete this team? Any list, pipe, or path shared with it will lose team access. Resources themselves are not deleted.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="destructive" onClick={handleDelete} disabled={busy}>
                      {busy ? 'Deleting...' : 'Delete team'}
                    </Button>
                    <Button variant="outline" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="text-red-400 border-red-500/40 hover:bg-red-500/10"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete team
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Transfer ownership confirmation */}
        {transferTarget && (
          <Dialog open={true} onOpenChange={(open) => { if (!open) setTransferTarget(null) }}>
            <DialogContent className="map-panel list-panel max-w-sm" focusOverlay>
              <DialogHeader>
                <DialogTitle>Transfer ownership</DialogTitle>
                <DialogDescription className="sr-only">Confirm ownership transfer</DialogDescription>
              </DialogHeader>
              <p className="text-sm text-gray-300 mb-4">
                Transfer this team to <span className="font-semibold">{transferTarget.email}</span>? They will gain full admin rights and you will become a regular member.
              </p>
              <div className="flex gap-2">
                <Button onClick={handleTransfer} disabled={busy} className="flex-1">
                  {busy ? 'Transferring...' : 'Transfer'}
                </Button>
                <Button variant="outline" onClick={() => setTransferTarget(null)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  )
}
