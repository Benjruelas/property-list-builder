import { useState, useRef } from 'react'
import { UserPlus, Trash2, LogOut, Pencil, Shield, ArrowRightLeft, Mail, Settings, MoreVertical, SlidersHorizontal } from 'lucide-react'
import { PanelBackButton } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { OptionsMenuDropdown, OptionsMenuItem } from './ui/OptionsMenuDropdown'
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
import { TeamEmailBrandingSection } from './TeamEmailBrandingSection'

const MEMBER_MENU_WIDTH = 200

function getMemberMeta(m, team, currentUser) {
  const isSelf = m.uid === currentUser?.uid
  const isTheCreator = m.uid === team.ownerId
  const memberRole = m.role === 'admin' || m.role === 'owner' || isTheCreator ? 'admin' : 'member'
  return { isSelf, isTheCreator, memberRole }
}

function memberHasMenuActions(m, team, currentUser, { isAdmin, isCreator }) {
  const { isSelf, isTheCreator, memberRole } = getMemberMeta(m, team, currentUser)
  if (isAdmin && !isSelf && memberRole === 'member') return true
  if (isAdmin && !isSelf && memberRole === 'admin' && !isTheCreator) return true
  if (isCreator && !isTheCreator) return true
  if ((isAdmin && !isTheCreator) || (isSelf && !isTheCreator)) return true
  return false
}

export function TeamDetails({ team, currentUser, getToken, onClose, onTeamsChange, pendingInvites = [] }) {
  const [addEmail, setAddEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(team.name || '')
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [transferTarget, setTransferTarget] = useState(null)
  const [featuresMember, setFeaturesMember] = useState(null)
  const [memberMenuUid, setMemberMenuUid] = useState(null)
  const memberMenuTriggerRef = useRef(null)

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

  const handleToggleDealAmounts = async () => {
    setBusy(true)
    try {
      await updateTeamSettings(getToken, team.id, {
        membersCanSeeDealAmounts: team.membersCanSeeDealAmounts === false,
      })
      showToast('Settings updated', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Failed to update settings', 'error')
    } finally {
      setBusy(false)
    }
  }

  const renderSettingsSwitch = (checked, onToggle, label, description) => (
    <div>
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-sm text-gray-300">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={busy}
          onClick={onToggle}
          className="settings-toggle relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-all duration-200 disabled:opacity-50"
        >
          <span
            className={cn(
              'inline-block h-5 w-5 transform rounded-full transition-all duration-200',
              checked ? 'translate-x-[24px] toggle-knob-on' : 'translate-x-[4px] toggle-knob-off'
            )}
          />
        </button>
      </label>
      {description && <p className="text-[11px] text-gray-500 mt-1">{description}</p>}
    </div>
  )

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
  const menuMember = memberMenuUid ? members.find((m) => m.uid === memberMenuUid) : null
  const menuMemberMeta = menuMember ? getMemberMeta(menuMember, team, currentUser) : null

  return (
    <Dialog open={true} modal={false} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="map-panel list-panel team-details-panel fullscreen-panel flex flex-col min-h-0 p-0"
        showCloseButton={false}
        hideOverlay
        nestedOverlay
        topLayer
        suppressBackdrop
      >
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
              <div className="space-y-3">
                {renderSettingsSwitch(
                  team.allowExternalSharing === true,
                  handleToggleExternalSharing,
                  'Allow external email sharing',
                  'When off, resources can only be shared with team members.'
                )}
                {renderSettingsSwitch(
                  team.membersCanSeeDealAmounts !== false,
                  handleToggleDealAmounts,
                  'Members can see deal amounts',
                  'When off, non-admin members won\'t see dollar amounts in Pipes, deals, or quotes.'
                )}
              </div>
            </div>
          )}

          {isAdmin && (
            <TeamEmailBrandingSection
              team={team}
              getToken={getToken}
              onSaved={refresh}
              disabled={busy}
            />
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
                const { isSelf, isTheCreator, memberRole } = getMemberMeta(m, team, currentUser)
                const showMenu = memberHasMenuActions(m, team, currentUser, { isAdmin, isCreator })
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
                    {showMenu && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-60 hover:opacity-100"
                        disabled={busy}
                        aria-label="Member options"
                        onClick={(e) => {
                          memberMenuTriggerRef.current = e.currentTarget
                          setMemberMenuUid(m.uid)
                        }}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    )}
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

        <OptionsMenuDropdown
          open={!!menuMember}
          onClose={() => setMemberMenuUid(null)}
          triggerRef={memberMenuTriggerRef}
          menuWidth={MEMBER_MENU_WIDTH}
          dataAttr="data-team-member-menu"
        >
          {menuMember && menuMemberMeta && (
            <>
              {isAdmin && !menuMemberMeta.isSelf && menuMemberMeta.memberRole === 'member' && (
                <>
                  <OptionsMenuItem
                    onClick={() => {
                      setFeaturesMember(menuMember)
                      setMemberMenuUid(null)
                    }}
                  >
                    <SlidersHorizontal className="h-4 w-4 shrink-0" />
                    Features
                  </OptionsMenuItem>
                  <OptionsMenuItem
                    onClick={() => {
                      handlePromote(menuMember.uid)
                      setMemberMenuUid(null)
                    }}
                  >
                    <Shield className="h-4 w-4 shrink-0" />
                    Promote to admin
                  </OptionsMenuItem>
                </>
              )}
              {isAdmin && !menuMemberMeta.isSelf && menuMemberMeta.memberRole === 'admin' && !menuMemberMeta.isTheCreator && (
                <OptionsMenuItem
                  onClick={() => {
                    handleDemote(menuMember.uid)
                    setMemberMenuUid(null)
                  }}
                >
                  <Shield className="h-4 w-4 shrink-0" />
                  Demote to member
                </OptionsMenuItem>
              )}
              {isCreator && !menuMemberMeta.isTheCreator && (
                <OptionsMenuItem
                  onClick={() => {
                    setTransferTarget(menuMember)
                    setMemberMenuUid(null)
                  }}
                >
                  <ArrowRightLeft className="h-4 w-4 shrink-0" />
                  Transfer ownership
                </OptionsMenuItem>
              )}
              {((isAdmin && !menuMemberMeta.isTheCreator) || (menuMemberMeta.isSelf && !menuMemberMeta.isTheCreator)) && (
                <OptionsMenuItem
                  destructive
                  onClick={() => {
                    handleRemoveMember(menuMember.uid, menuMemberMeta.isSelf)
                    setMemberMenuUid(null)
                  }}
                >
                  {menuMemberMeta.isSelf ? (
                    <>
                      <LogOut className="h-4 w-4 shrink-0" />
                      Leave team
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 shrink-0" />
                      Remove member
                    </>
                  )}
                </OptionsMenuItem>
              )}
            </>
          )}
        </OptionsMenuDropdown>

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
