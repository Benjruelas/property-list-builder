import { useState } from 'react'
import { UserPlus, Trash2, LogOut, Pencil, Shield, ArrowRightLeft, Mail, Settings } from 'lucide-react'
import { PanelBackButton } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import { showToast } from './ui/toast'
import {
  inviteTeamMember,
  removeTeamMember,
  renameTeam,
  deleteTeam,
  transferTeamOwnership,
  teamRoleForUser,
  isTeamAdminRole,
  promoteTeamAdmin,
  demoteTeamAdmin,
  updateTeamSettings,
  updateMemberFeatures,
} from '@/utils/teams'
import { TeamMemberFeaturesDialog } from './TeamMemberFeaturesDialog'

export function TeamDetails({ team, currentUser, getToken, onClose, onTeamsChange, pendingInvites = [] }) {
  const [addEmail, setAddEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(team.name || '')
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [transferTarget, setTransferTarget] = useState(null)
  const [featuresMember, setFeaturesMember] = useState(null)

  const role = teamRoleForUser(team, currentUser)
  const isAdmin = isTeamAdminRole(team, currentUser)
  const isCreator = team.ownerId === currentUser?.uid
  const teamPendingInvites = pendingInvites.filter((i) => i.teamId === team.id)

  const refresh = async () => { if (onTeamsChange) await onTeamsChange() }

  const handleInvite = async () => {
    const email = addEmail.trim().toLowerCase()
    if (!email) { showToast('Enter an email', 'error'); return }
    setAdding(true)
    try {
      await inviteTeamMember(getToken, team.id, email)
      setAddEmail('')
      showToast('Invite sent', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Failed to send invite', 'error')
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
    if (!window.confirm(`Transfer ownership to ${transferTarget.email}? They will become an admin.`)) return
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

  const handleToggleExternalSharing = async () => {
    setBusy(true)
    try {
      await updateTeamSettings(getToken, team.id, {
        allowExternalSharing: !team.allowExternalSharing,
      })
      showToast('Settings updated', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Failed to update settings', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handlePromote = async (uid) => {
    setBusy(true)
    try {
      await promoteTeamAdmin(getToken, team.id, uid)
      showToast('Member promoted to admin', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleDemote = async (uid) => {
    setBusy(true)
    try {
      await demoteTeamAdmin(getToken, team.id, uid)
      showToast('Admin demoted to member', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveFeatures = async (features) => {
    if (!featuresMember) return
    setBusy(true)
    try {
      await updateMemberFeatures(getToken, team.id, featuresMember.uid, features)
      showToast('Feature access updated', 'success')
      setFeaturesMember(null)
      await refresh()
    } catch (e) {
      showToast(e.message || 'Failed to update features', 'error')
    } finally {
      setBusy(false)
    }
  }

  const members = team.members || []
  const seatCount = members.length
  const seatLimit = team.seatLimit || 10

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="map-panel list-panel fullscreen-panel" showCloseButton={false} hideOverlay>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/20 text-left" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
          <DialogDescription className="sr-only">Team details, members, and settings</DialogDescription>
          <div className="map-panel-header-toolbar">
            <div className="map-panel-header-title-wrap flex min-w-0 items-center gap-3 flex-1">
              <PanelBackButton onClick={onClose} />
              <div className="min-w-0 flex-1">
                {renaming && isAdmin ? (
                  <div className="flex gap-2">
                    <Input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setRenaming(false); setRenameValue(team.name || '') } }}
                      maxLength={80} className="flex-1" />
                    <Button size="sm" onClick={handleRename} disabled={busy}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => { setRenaming(false); setRenameValue(team.name || '') }}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-left text-xl font-semibold truncate">{team.name}</DialogTitle>
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Rename team" onClick={() => setRenaming(true)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto scrollbar-hide flex-1" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="mb-4 flex items-center gap-2 text-xs text-gray-400">
            <Shield className="h-3.5 w-3.5" />
            <span>
              {seatCount}/{seatLimit} seats · {role === 'admin' ? 'You are an admin' : 'Member'}
              {isCreator ? ' · Creator' : ''}
            </span>
          </div>

          {isAdmin && (
            <div className="mb-5 rounded-md border border-white/10 p-3 bg-black/10">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="h-3.5 w-3.5 text-gray-400" />
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Team settings</p>
              </div>
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm text-gray-300">Allow external email sharing</span>
                <button type="button" role="switch" aria-checked={team.allowExternalSharing === true}
                  disabled={busy} onClick={handleToggleExternalSharing}
                  className={cn('relative h-5 w-9 rounded-full transition-colors', team.allowExternalSharing ? 'bg-blue-500' : 'bg-white/20')}>
                  <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform', team.allowExternalSharing ? 'left-4' : 'left-0.5')} />
                </button>
              </label>
              <p className="text-[11px] text-gray-500 mt-1">When off, resources can only be shared with team members.</p>
            </div>
          )}

          {isAdmin && (
            <div className="mb-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Invite member</p>
              <div className="flex gap-2">
                <Input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()} placeholder="user@example.com"
                  disabled={adding || seatCount >= seatLimit} className="flex-1" />
                <Button onClick={handleInvite} disabled={adding || !addEmail.trim() || seatCount >= seatLimit}>
                  <UserPlus className="h-4 w-4 mr-1" />
                  {adding ? 'Sending...' : 'Invite'}
                </Button>
              </div>
              {seatCount >= seatLimit && (
                <p className="text-xs text-amber-500 mt-1">Seat limit reached.</p>
              )}
              <p className="text-xs text-gray-500 mt-2">Invites must be accepted before the user joins.</p>
            </div>
          )}

          {isAdmin && teamPendingInvites.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Pending invites</p>
              <ul className="space-y-1">
                {teamPendingInvites.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-amber-500/10 text-sm text-amber-200">
                    <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{inv.email}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Members</p>
            <ul className="space-y-1.5">
              {members.map((m) => {
                const isSelf = m.uid === currentUser?.uid
                const memberRole = m.role === 'admin' || m.role === 'owner' || m.uid === team.ownerId ? 'admin' : 'member'
                const isTheCreator = m.uid === team.ownerId
                return (
                  <li key={m.uid} className="group flex items-center justify-between gap-2 py-2 px-3 rounded-md bg-black/10">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-200 truncate">{m.email || m.uid}</span>
                        {isSelf && <span className="text-[10px] text-gray-400">(you)</span>}
                        {memberRole === 'admin' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/40 uppercase">Admin</span>
                        )}
                        {isTheCreator && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-400/40 uppercase">Creator</span>
                        )}
                      </div>
                      {(m.joinedAt || m.addedAt) && (
                        <p className="text-[11px] text-gray-500">Joined {new Date(m.joinedAt || m.addedAt).toLocaleDateString()}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isAdmin && !isSelf && memberRole === 'member' && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFeaturesMember(m)} disabled={busy}>
                          Features
                        </Button>
                      )}
                      {isAdmin && !isSelf && memberRole === 'member' && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handlePromote(m.uid)} disabled={busy}>Promote</Button>
                      )}
                      {isAdmin && !isSelf && memberRole === 'admin' && !isTheCreator && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleDemote(m.uid)} disabled={busy}>Demote</Button>
                      )}
                      {isCreator && !isTheCreator && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Transfer ownership" onClick={() => setTransferTarget(m)} disabled={busy}>
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {(isAdmin && !isTheCreator) || (isSelf && !isTheCreator) ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300"
                          title={isSelf ? 'Leave team' : 'Remove member'} onClick={() => handleRemoveMember(m.uid, isSelf)} disabled={busy}>
                          {isSelf ? <LogOut className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {isAdmin && (
            <div className="pt-4 border-t border-white/10">
              {confirmingDelete ? (
                <div className="rounded-md bg-red-900/20 border border-red-500/30 p-3">
                  <p className="text-sm text-red-200 mb-2">Delete this team? Shared resources will lose team access.</p>
                  <div className="flex gap-2">
                    <Button variant="destructive" onClick={handleDelete} disabled={busy}>{busy ? 'Deleting...' : 'Delete team'}</Button>
                    <Button variant="outline" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="text-red-400 border-red-500/40 hover:bg-red-500/10" onClick={() => setConfirmingDelete(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />Delete team
                </Button>
              )}
            </div>
          )}
        </div>

        {transferTarget && (
          <Dialog open={true} onOpenChange={(open) => { if (!open) setTransferTarget(null) }}>
            <DialogContent className="map-panel list-panel max-w-sm" focusOverlay>
              <DialogHeader>
                <DialogTitle>Transfer ownership</DialogTitle>
                <DialogDescription className="sr-only">Confirm ownership transfer</DialogDescription>
              </DialogHeader>
              <p className="text-sm text-gray-300 mb-4">
                Transfer this team to <span className="font-semibold">{transferTarget.email}</span>?
              </p>
              <div className="flex gap-2">
                <Button onClick={handleTransfer} disabled={busy} className="flex-1">{busy ? 'Transferring...' : 'Transfer'}</Button>
                <Button variant="outline" onClick={() => setTransferTarget(null)} className="flex-1">Cancel</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        <TeamMemberFeaturesDialog
          open={!!featuresMember}
          member={featuresMember}
          onClose={() => setFeaturesMember(null)}
          onSave={handleSaveFeatures}
          saving={busy}
        />
      </DialogContent>
    </Dialog>
  )
}
