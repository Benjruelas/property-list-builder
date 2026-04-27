import { useState, useEffect, useMemo } from 'react'
import { X, Plus, Users2, Shield, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Input } from './ui/input'
import { showToast } from './ui/toast'
import { createTeam, fetchTeams, teamRoleForUser } from '@/utils/teams'
import { TeamDetails } from './TeamDetails'

/** Match ListPanel list rows; `teams-panel-list-item` is excluded in index.css from .list-panel button resets. */
const TEAM_LIST_ITEM_CLASS =
  'teams-panel-list-item map-panel-list-item w-full flex flex-col items-stretch p-3 rounded-lg transition-all cursor-pointer text-left border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98]'

export function TeamsPanel({
  isOpen,
  onClose,
  currentUser,
  getToken,
  teams,
  onTeamsChange
}) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [openTeamId, setOpenTeamId] = useState(null)

  useEffect(() => {
    if (!isOpen) {
      setCreating(false)
      setNewName('')
      setOpenTeamId(null)
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
    setSubmitting(true)
    try {
      await createTeam(getToken, name)
      showToast('Team created', 'success')
      setCreating(false)
      setNewName('')
      await refresh()
    } catch (e) {
      if (e.code === 'upgrade_required') {
        showToast('Teams is a Pro feature. Upgrade to create a team.', 'info')
      } else {
        showToast(e.message || 'Failed to create team', 'error')
      }
    } finally {
      setSubmitting(false)
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

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent
          className="map-panel list-panel fullscreen-panel"
          showCloseButton={false}
          hideOverlay
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/20 text-left" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
            <DialogDescription className="sr-only">Manage your teams and members</DialogDescription>
            <div className="map-panel-header-toolbar">
              <DialogTitle className="map-panel-header-title-wrap text-left text-xl font-semibold truncate">Teams</DialogTitle>
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
            {/* Create team row */}
            {creating ? (
              <div className="mb-4 flex gap-2">
                <Input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') { setCreating(false); setNewName('') }
                  }}
                  placeholder="Team name"
                  maxLength={80}
                  className="flex-1"
                />
                <Button onClick={handleCreate} disabled={submitting || !newName.trim()}>
                  {submitting ? 'Creating...' : 'Create'}
                </Button>
                <Button variant="outline" onClick={() => { setCreating(false); setNewName('') }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setCreating(true)}
                variant="glass-outline"
                className="mb-4 w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create team
              </Button>
            )}

            {sortedTeams.length === 0 ? (
              <div className="text-center py-8">
                <Users2 className="h-10 w-10 mx-auto mb-3 text-gray-400 opacity-60" />
                <p className="text-gray-500 text-sm">You're not in any teams yet.</p>
                <p className="text-gray-400 text-xs mt-1">Create a team to share lists, pipes, and paths with a group.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedTeams.map((team) => {
                  const role = teamRoleForUser(team, currentUser)
                  const isOwner = role === 'owner'
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => setOpenTeamId(team.id)}
                      className={TEAM_LIST_ITEM_CLASS}
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="font-medium text-sm truncate">{team.name}</span>
                          {isOwner && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/40 uppercase tracking-wide flex items-center gap-1 shrink-0">
                              <Shield className="h-2.5 w-2.5" /> Owner
                            </span>
                          )}
                        </div>
                        <Users2 className="h-4 w-4 flex-shrink-0 text-white/70" aria-hidden />
                      </div>
                      <span className="text-xs text-gray-500 block mt-0.5 w-full min-w-0 text-left">
                        {team.members?.length || 0} member{(team.members?.length || 0) === 1 ? '' : 's'}
                        {!isOwner && team.ownerEmail ? ` · owned by ${team.ownerEmail}` : ''}
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
          onClose={() => setOpenTeamId(null)}
          onTeamsChange={onTeamsChange}
        />
      )}
    </>
  )
}
