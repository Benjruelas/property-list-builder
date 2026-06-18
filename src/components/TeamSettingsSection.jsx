import { useState, useEffect, useMemo } from 'react'
import { Plus, Users2, Shield, Mail, Check, X, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { showToast } from './ui/toast'
import {
  createTeam,
  isTeamAdminRole,
  acceptTeamInvite,
  declineTeamInvite,
} from '@/utils/teams'
import { cn } from '@/lib/utils'

const TEAM_LIST_ITEM_CLASS =
  'teams-panel-list-item map-panel-list-item w-full flex flex-col items-stretch p-3 rounded-lg transition-all cursor-pointer text-left border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98]'

function TeamInvitesBanner({ invites, inviteBusy, onAccept, onDecline }) {
  if (!invites.length) return null
  return (
    <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <p className="text-xs font-medium text-amber-200 uppercase tracking-wide mb-2">Team invites</p>
      <ul className="space-y-2">
        {invites.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-amber-300 flex-shrink-0" />
              <span className="text-sm text-gray-200 truncate">{inv.teamName || 'Team'}</span>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={inviteBusy === inv.id}
                onClick={() => onDecline(inv)}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" className="h-7 px-2" disabled={inviteBusy === inv.id}
                onClick={() => onAccept(inv)}>
                <Check className="h-3.5 w-3.5 mr-1" />
                {inviteBusy === inv.id ? '...' : 'Join'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TeamSettingsSection({
  currentUser,
  getToken,
  teams = [],
  teamMembership = null,
  pendingInvites = [],
  onTeamsChange,
  onOpenTeamDetail,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(null)

  const incomingInvites = pendingInvites.filter((i) => i.status === 'pending')

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

  const canCreateTeam = !teamMembership && sortedTeams.length === 0

  useEffect(() => {
    if (!canCreateTeam) {
      setCreating(false)
      setNewName('')
    }
  }, [canCreateTeam])

  const refresh = async () => {
    if (onTeamsChange) await onTeamsChange()
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

  return (
    <div className="settings-section border border-white/10 rounded-lg overflow-hidden" data-tour="settings-team-section">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold hover:bg-white/5 transition-colors"
      >
        <Users2 className="h-4 w-4 flex-shrink-0 opacity-70" />
        <span className="flex-1 text-left">Team</span>
        {open ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <TeamInvitesBanner
            invites={incomingInvites}
            inviteBusy={inviteBusy}
            onAccept={handleAcceptInvite}
            onDecline={handleDeclineInvite}
          />

          {canCreateTeam && (creating ? (
            <div className="flex gap-2">
              <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                placeholder="Team name" maxLength={80} className="flex-1" />
              <Button onClick={handleCreate} disabled={submitting || !newName.trim()} size="sm">
                {submitting ? 'Creating...' : 'Create'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setCreating(false); setNewName('') }}>Cancel</Button>
            </div>
          ) : (
            <Button onClick={() => setCreating(true)} variant="glass-outline" className="w-full" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create team
            </Button>
          ))}

          {sortedTeams.length === 0 ? (
            <p className="text-xs opacity-50">
              {teamMembership
                ? `You're on ${teamMembership.teamName || 'a team'}.`
                : 'Create a team or accept an invite to collaborate.'}
            </p>
          ) : (
            <div className="space-y-2">
              {sortedTeams.map((team) => {
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
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Pending invites for users who are not yet on a team (non-admin path). */
export function TeamSettingsInvitesOnly({
  getToken,
  pendingInvites = [],
  onTeamsChange,
}) {
  const [inviteBusy, setInviteBusy] = useState(null)
  const incomingInvites = pendingInvites.filter((i) => i.status === 'pending')
  if (!incomingInvites.length) return null

  const refresh = async () => {
    if (onTeamsChange) await onTeamsChange()
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

  return (
    <div className="settings-section border border-white/10 rounded-lg overflow-hidden px-4 py-3" data-tour="settings-team-section">
      <TeamInvitesBanner
        invites={incomingInvites}
        inviteBusy={inviteBusy}
        onAccept={handleAcceptInvite}
        onDecline={handleDeclineInvite}
      />
    </div>
  )
}

/** Static team name row for non-admin members. */
export function TeamSettingsMemberRow({ teamName }) {
  if (!teamName) return null
  return (
    <div
      className={cn(
        'settings-section border border-white/10 rounded-lg px-4 py-3 flex items-center gap-2'
      )}
      data-tour="settings-team-section"
    >
      <Users2 className="h-4 w-4 flex-shrink-0 opacity-70" />
      <div className="min-w-0">
        <div className="text-xs opacity-50">Team</div>
        <div className="text-sm font-medium truncate">{teamName}</div>
      </div>
    </div>
  )
}
