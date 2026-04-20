# Release Notes

## Teams Feature (April 2026)

This release introduces **Teams**, a new sharing layer that lets owners share resources with an entire group of users at once instead of inviting them one-by-one. New members automatically inherit access to everything the team has been given.

### What's new

- **Create a Team** from the side menu (`Teams`). Each team has an owner, a seat limit, and a list of members.
- **Share to a Team** — Lists, Paths, and Deal Pipelines now have a "Share with a team" section in their share dialog. Pick one or more teams and every member gets immediate access.
- **Team badges** — Rows now show a `Team: X` badge whenever a resource is shared with a team so you can see at a glance who has access.
- **Team tasks (Pipelines)** — A new "Team Tasks" section appears on any lead inside a team-shared pipeline. Every member can see, add, complete, and delete these shared tasks. Your existing personal tasks are now shown in a separate "My Tasks" section and remain private.
- **Ownership transfer** — Team owners can transfer ownership to any member from the team's details dialog.

### ⚠️ Breaking change: List collaborator rights

Previously, any user you shared a List with was **read-only** — they could see the parcels but could not modify them. As part of the sharing unification in this release, **List collaborators can now add and remove parcels** from lists that are shared with them. Owner-only rights remain:

- Renaming the list
- Changing who the list is shared with (people or teams)
- Deleting the list

If you rely on Lists being read-only, do **not** share them with users you don't fully trust with parcel membership. We recommend:

- Reviewing existing `sharedWith` on your lists and removing any unintended recipients.
- Preferring Deal Pipelines for collaboration where finer-grained control (and team tasks) is required.

A one-time in-app notice is shown to users on first login after this release flagging this change.

### Deferred / Phase 2 items

- Deep integration of team tasks into the global Tasks panel (they currently live on the lead only).
- Billing integration for seat counts (today, seat limits are enforced at the API level but are not user-visible in billing).
- Email→UID resolution for users who have never used the app (today, invitees must sign up first; they can then be added to a team).

### Notes for operators

- No data migration is required. `teamShares` defaults to `[]` on all existing resources.
- `teams` is a new KV key; it is created lazily the first time any user creates a team.
- The team paywall gate (`userCanCreateTeam` in `api/lib/teams.js`) currently allows all authenticated users. Tighten this when billing ships.
