import { useState, useEffect, useMemo, useRef } from 'react'
import { useObscuredPanelRoot } from '@/hooks/useObscuredPanelRoot'
import { Plus, Users2, Shield, Mail, Check, X } from 'lucide-react'
import { PanelHeader, PANEL_LIST_HEADER_CLASS, PANEL_LIST_HEADER_STYLE } from './ui/panel-header'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { handlePanelDialogOpenChange } from './ui/panelDialogUtils'
import { Input } from './ui/input'
import { showToast } from './ui/toast'
import {
  createTeam,
  teamRoleForUser,
  isTeamAdminRole,
  acceptTeamInvite,
  declineTeamInvite,
} from '@/utils/teams'
import { TeamDetails } from './TeamDetails'
import { cn } from '@/lib/utils'

const TEAM_LIST_ITEM_CLASS =
  'teams-panel-list-item map-panel-list-item w-full flex flex-col items-stretch p-3 rounded-lg transition-all cursor-pointer text-left border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98]'

export function TeamsPanel({
  isOpen,
  instantDismiss = false,
  onClose,
  onBack,
  detailTeamId = null,
  onOpenTeamDetail,
  onCloseTeamDetail,
  currentUser,
  getToken,
  teams,
  onTeamsChange,
  pendingInvites = [],
  teamMembership = null,
}) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const openTeamId = detailTeamId
  const [inviteBusy, setInviteBusy] = useState(null)

  useEffect(() => {
    if (!isOpen) {
      setCreating(false)
      setNewName('')
    }
  }, [isOpen])

  const refresh = async () => {
    if (!onTeamsChange) return
    await onTeamsChange()
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      showToast('Enter a team name', 'error')
      return
    }
    if (teamMembership) {
      showToast('Leave your current team before creating a new one', 'error')
      return
    }
    setSubmitting(true)
    try {
      await createTeam(getToken, name)
      showToast('Team created', 'success')
      setCreating(false)
      setNewName('')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Failed to create team', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAcceptInvite = async (inv) => {
    setInviteBusy(inv.id)
    try {
      await acceptTeamInvite(getToken, { inviteId: inv.id, teamId: inv.teamId })
      showToast(`Joined ${inv.teamName || 'team'}`, 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Failed to accept invite', 'error')
    } finally {
      setInviteBusy(null)
    }
  }

  const handleDeclineInvite = async (inv) => {
    setInviteBusy(inv.id)
    try {
      await declineTeamInvite(getToken, { inviteId: inv.id, teamId: inv.teamId })
      showToast('Invite declined', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Failed to decline invite', 'error')
    } finally {
      setInviteBusy(null)
    }
  }

  const sortedTeams = useMemo(() => {
    const list = Array.isArray(teams) ? [...teams] : []
    list.sort((a, b) => {
      const ao = a.ownerId === currentUser?.uid ? 0 : 1
      const bo = b.ownerId === currentUser?.uid ? 0 : 1
      if (ao !== bo) return ao - bo
      return (a.name || '').localeCompare(b.name || '')
    })
    return list
  }, [teams, currentUser])

  const activeTeam = useMemo(
    () => (openTeamId ? sortedTeams.find((t) => t.id === openTeamId) : null),
    [openTeamId, sortedTeams]
  )

  const incomingInvites = pendingInvites.filter((i) => i.status === 'pending')

  const canCreateTeam = !teamMembership && sortedTeams.length === 0

  useEffect(() => {
    if (!canCreateTeam) {
      setCreating(false)
      setNewName('')
    }
  }, [canCreateTeam])

  const handlePanelBack = () => {
    if (openTeamId) {
      onCloseTeamDetail?.()
      return
    }
    onBack?.() ?? onClose?.()
  }

  const handleTeamDetailClose = () => {
    onCloseTeamDetail?.()
  }

  const hasNestedDetail = !!openTeamId
  const listPanelRef = useRef(null)
  useObscuredPanelRoot(listPanelRef, hasNestedDetail)

  return (
    <>
      <Dialog open={isOpen} modal={false} onOpenChange={(open) => handlePanelDialogOpenChange(open, hasNestedDetail, handlePanelBack, isOpen)}>
        <DialogContent
          ref={listPanelRef}
          className={cn(
            'map-panel list-panel teams-panel fullscreen-panel flex flex-col min-h-0 p-0',
            hasNestedDetail && 'crm-panel-obscured'
          )}
          showCloseButton={false}
          hideOverlay
          suppressBackdrop
          instantDismiss={instantDismiss && !isOpen}
        >
          <DialogHeader className={PANEL_LIST_HEADER_CLASS} style={PANEL_LIST_HEADER_STYLE}>
            <DialogDescription className="sr-only">Manage your teams and members</DialogDescription>
            <PanelHeader onBack={handlePanelBack} title="Teams" />
          </DialogHeader>

          <div className="px-6 py-4 overflow-y-auto scrollbar-hide flex-1" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            {incomingInvites.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-xs font-medium text-amber-200 uppercase tracking-wide mb-2">Team invites</p>
                <ul className="space-y-2">
                  {incomingInvites.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-amber-300 flex-shrink-0" />
                        <span className="text-sm text-gray-200 truncate">{inv.teamName || 'Team'}</span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" variant="outline" className="h-7 px-2" disabled={inviteBusy === inv.id}
                          onClick={() => handleDeclineInvite(inv)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" className="h-7 px-2" disabled={inviteBusy === inv.id}
                          onClick={() => handleAcceptInvite(inv)}>
                          <Check className="h-3.5 w-3.5 mr-1" />
                          {inviteBusy === inv.id ? '...' : 'Join'}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canCreateTeam && (creating ? (
              <div className="mb-4 flex gap-2">
                <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                  placeholder="Team name" maxLength={80} className="flex-1" />
                <Button onClick={handleCreate} disabled={submitting || !newName.trim()}>
                  {submitting ? 'Creating...' : 'Create'}
                </Button>
                <Button variant="outline" onClick={() => { setCreating(false); setNewName('') }}>Cancel</Button>
              </div>
            ) : (
              <Button onClick={() => setCreating(true)} variant="glass-outline" className="mb-4 w-full">
                <Plus className="h-4 w-4 mr-2" />
                Create team
              </Button>
            ))}

            {teamMembership && sortedTeams.length === 0 && (
              <p className="text-xs text-gray-500 mb-3">You are on team {teamMembership.teamName}. Open it from notifications if it is not listed.</p>
            )}

            {sortedTeams.length === 0 ? (
              <div className="text-center py-8">
                <Users2 className="h-10 w-10 mx-auto mb-3 text-gray-400 opacity-60" />
                <p className="text-gray-500 text-sm">
                  {teamMembership ? `You're on ${teamMembership.teamName || 'a team'}.` : "You're not in any teams yet."}
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  {canCreateTeam ? 'Create a team or accept an invite to collaborate.' : 'Accept an invite to collaborate with others.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedTeams.map((team) => {
                  const role = teamRoleForUser(team, currentUser)
                  const isAdmin = isTeamAdminRole(team, currentUser)
                  return (
                    <button key={team.id} type="button" onClick={() => onOpenTeamDetail?.(team.id)} className={TEAM_LIST_ITEM_CLASS}>
                      <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="font-medium text-sm truncate">{team.name}</span>
                          {isAdmin && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/40 uppercase tracking-wide flex items-center gap-1 shrink-0">
                              <Shield className="h-2.5 w-2.5" /> Admin
                            </span>
                          )}
                        </div>
                        <Users2 className="h-4 w-4 flex-shrink-0 text-white/70" aria-hidden />
                      </div>
                      <span className="text-xs text-gray-500 block mt-0.5 w-full min-w-0 text-left">
                        {team.members?.length || 0} member{(team.members?.length || 0) === 1 ? '' : 's'}
                        {role === 'member' && team.ownerEmail ? ` · admin: ${team.ownerEmail}` : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {activeTeam && (
        <TeamDetails
          team={activeTeam}
          currentUser={currentUser}
          getToken={getToken}
          onClose={handleTeamDetailClose}
          onTeamsChange={onTeamsChange}
          pendingInvites={pendingInvites}
        />
      )}
    </>
  )
}
