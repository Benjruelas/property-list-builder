# Push Notifications – Test Procedure

Use this procedure to verify that push notifications work correctly in the app.

---

## Prerequisites

Before testing, ensure:

1. **HTTPS** – App is served over HTTPS (or `localhost` for local dev). Push requires a secure context.
2. **Environment variables** – `VITE_FIREBASE_VAPID_KEY`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `FIREBASE_SERVICE_ACCOUNT_JSON` are configured. See `PUSH_NOTIFICATIONS_SETUP.md`.
3. **Two test accounts** – At least two signed-in users (e.g. User A and User B) for share tests.

---

## 1. First-time prompt and enable flow

| Step | Action | Expected result |
|------|--------|-----------------|
| 1.1 | Sign in with a fresh account (or clear `push_first_prompt_done` from localStorage). | App loads normally. |
| 1.2 | Wait ~2 seconds after the map loads. | Browser shows "Allow" / "Block" notification permission prompt. |
| 1.3 | Click **Allow**. | Permission granted. Push is enabled and FCM token is saved. Toast: "Push notifications enabled". |
| 1.4 | If you clicked **Block**, open **Settings** → Push notifications section. | Switch is off. Message: "Notifications were denied. Enable them in your browser's site settings..." |
| 1.5 | Open **Settings** → Push notifications. Toggle **Enable push notifications** ON. | If permission was granted: switch turns on, toast "Push notifications enabled". If denied: switch stays off, shows denied message. You can try again via the toggle after resetting permissions in browser site settings (set to Ask). |

### If the prompt does not appear at 1.2

1. **Check dev console** – In local dev, the app logs why the prompt was skipped (e.g. `[push] First-time prompt skipped: ...`).
2. **Reset localStorage** – Open DevTools → Application → Local Storage → delete `push_first_prompt_done`. The prompt only shows once per origin.
3. **Reset site permissions** – If you previously blocked notifications, the browser won’t re-prompt. In Chrome: click the lock/info icon → Site settings → Notifications → Allow.
4. **Confirm VAPID key** – Ensure `VITE_FIREBASE_VAPID_KEY` is set in `.env.local` and restart the dev server.
5. **Avoid dev bypass** – The prompt is skipped for `dev@localhost`. Use a different account for testing.

---

## 2. Export ready notification

**Setup:** User must have push enabled and "Export ready" turned on in Settings.

| Step | Action | Expected result |
|------|--------|-----------------|
| 2.1 | Open **Settings** → Push notifications. Ensure **Enable push notifications** and **Export ready** are ON. | Settings reflect enabled state. |
| 2.2 | Create a list with at least one parcel. | List exists. |
| 2.3 | Open the list panel → **Export list**. Trigger export (email will be sent). | Export completes. Toast confirms export. |
| 2.4 | Within 5–10 seconds. | Push notification appears: "Export ready" with body "Your list '[name]' has been sent to your email." |

---

## 3. List shared notification

**Setup:** Two users (A = sharer, B = recipient). Recipient (B) must create at least one list first and have push enabled.

| Step | Action | Expected result |
|------|--------|-----------------|
| 3.1 | **User B:** Sign in and create at least one list (so B's email exists for share validation). | B’s email→UID mapping is stored. |
| 3.2 | **User B:** Enable push in Settings (master switch + "List shared with me" ON). | B has FCM token and list-share preference enabled. |
| 3.3 | **User A:** Create a list and share it with User B’s email. | Share succeeds. |
| 3.4 | **User B:** Within a few seconds. | Push notification: "List shared with you" with body "[Sharer] shared '[List name]' with you." |
| 3.5 | **User B:** Click notification. | App opens (or focuses) to the list. |

---

## 4. Pipeline shared notification

**Setup:** Same as list share – User A shares, User B receives.

| Step | Action | Expected result |
|------|--------|-----------------|
| 4.1 | **User B:** Enable push and ensure "Pipeline shared with me" is ON in Settings. | Preference saved. |
| 4.2 | **User A:** Open Deal Pipeline. Click ⋮ next to pipeline title → **Share pipeline**. Enter User B’s email, save. | Share succeeds. |
| 4.3 | **User B:** Within a few seconds. | Push notification: "Pipeline shared with you" with body "[Sharer] shared '[Pipeline title]' with you." |

---

## 5. Task reminders

**Setup:** User has push enabled, "Task reminders" ON, and at least one scheduled task due within the next hour.

| Step | Action | Expected result |
|------|--------|-----------------|
| 5.1 | Add a lead to the pipeline. | Lead appears. |
| 5.2 | Open the lead → **Add task**. Create a task and schedule it for a time **within the next 60 minutes** (e.g. 15 minutes from now). Save. | Task is saved with scheduled time. |
| 5.3 | Wait until the task-reminder cron runs (hourly). Or trigger manually if you have access: `GET /api/cron/task-reminders` with `CRON_SECRET` header. | Cron runs. |
| 5.4 | Within the next hour. | Push notification: "Task reminder" with task title and time. |

---

## 6. Disable and re-enable flow

| Step | Action | Expected result |
|------|--------|-----------------|
| 6.1 | With push enabled, open **Settings** → Toggle **Enable push notifications** OFF. | Switch off. Toast or confirmation. |
| 6.2 | Toggle **Enable push notifications** ON. | If permission still granted: no new prompt, switch turns on. If denied: denied message, switch remains off. |
| 6.3 | If permission was previously granted and you re-enabled. | Push works for new events (export, share, etc.). |

---

## 7. Preference filtering

**Export ready off:**

| Step | Action | Expected result |
|------|--------|-----------------|
| 7.1 | Enable push, but turn **Export ready** OFF. | Export ready is off. |
| 7.2 | Trigger a list export. | Export completes. **No push** for "Export ready". |

**List shared off:**

| Step | Action | Expected result |
|------|--------|-----------------|
| 7.3 | Enable push, but turn **List shared with me** OFF. | List shared is off. |
| 7.4 | Have another user share a list with you. | **No push** for list share. |

---

## Quick checklist

- [ ] First-time prompt appears ~2 seconds after sign-in
- [ ] Allow grants permission and enables push
- [ ] Block shows denied message in Settings
- [ ] Export ready sends push when export completes
- [ ] List shared sends push to recipient when list is shared
- [ ] Pipeline shared sends push to recipient when pipeline is shared
- [ ] Task reminders send push for tasks due within next hour
- [ ] Disable/re-enable works (no prompt if already granted)
- [ ] Per-type preferences (Export ready, List shared, etc.) filter correctly

---

## Test 3 troubleshooting (list share push not received)

If step 3.4 fails, check the following:

1. **User B must create a list first** – The share validation requires B's email to exist in the system (as list owner or sharedWith). If B has never created a list, the share at 3.3 may fail with "No user found". Have B create at least one list before A shares.

2. **User B must enable push** – B must open Settings → Push notifications, turn ON "Enable push notifications", and have "List shared with me" ON. The FCM token is saved when enabled.

3. **KV and Firebase config** – Push needs Vercel KV (or Redis) and `FIREBASE_SERVICE_ACCOUNT_JSON` in your deployment. Without KV, user-data (including fcmToken) cannot be stored.

4. **Server logs** – When sendPushToEmail fails, the API logs a specific reason. Check Vercel Function logs for:
   - `no uid for email` → B never signed in, or KV/Firebase Admin issue
   - `no fcmToken` → B didn't enable push in Settings
   - `disabled share notifications` → B turned off "List shared with me"
   - `FIREBASE_SERVICE_ACCOUNT_JSON missing` → Service account not configured

---

## Troubleshooting

| Symptom | Likely cause |
|---------|---------------|
| No first-time prompt | `push_first_prompt_done` in localStorage; clear it to retest. |
| "Push notifications are not configured" | `VITE_FIREBASE_VAPID_KEY` missing from `.env.local`. |
| "Notifications require HTTPS" | Running over HTTP; use HTTPS or `localhost`. |
| Export/share succeeds but no push | Recipient hasn’t signed in; or `FIREBASE_SERVICE_ACCOUNT_JSON` not set in deployment. |
| Push works in dev but not production | Check `FIREBASE_SERVICE_ACCOUNT_JSON` and Vercel env vars. |
