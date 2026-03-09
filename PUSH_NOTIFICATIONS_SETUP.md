# Push Notifications Setup

This app sends push notifications for:

- **Export ready** – When a list export is emailed: "Your list X has been sent to your email."
- **List shared** – When someone shares a list with you: "X shared 'List Name' with you."
- **Pipeline shared** – When someone shares a deal pipeline with you: "X shared 'Pipeline Title' with you."
- **Task reminders** – When a scheduled task is due in the next hour: "Task reminder" with task title and time.

## Prerequisites

1. **Firebase project** with Cloud Messaging enabled
2. **VAPID key** for web push (Firebase Console → Project Settings → Cloud Messaging → Web Push certificates)
3. **Service account** for server-side FCM (Firebase Console → Project Settings → Service accounts → Generate new private key)

## Environment Variables

### Client (Vite / `.env.local`)

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_VAPID_KEY` | Web push VAPID key from Firebase Console |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID (same as in Firebase config) |

### Server (Vercel / `.env`)

| Variable | Description |
|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON string of the service account key (for FCM send) |
| `CRON_SECRET` | Secret for task reminders cron (Vercel Cron sends it automatically; set for auth) |

## Getting the Service Account JSON

1. Firebase Console → Project Settings → Service accounts
2. Click "Generate new private key"
3. Copy the entire JSON object
4. In Vercel: Settings → Environment Variables → Add `FIREBASE_SERVICE_ACCOUNT_JSON` with the JSON as the value (as a single line or escaped)

## Build

The service worker is generated at build time:

```bash
npm run build
```

This runs `node scripts/generate-messaging-sw.js` before the Vite build, which creates `public/firebase-messaging-sw.js` from your env vars.

## How It Works

1. **User enables push** – In Settings, user toggles "Enable push notifications". The app requests permission, gets an FCM token, and saves it to `user-data` (KV) via PATCH.
2. **Email→UID mapping** – When users hit `user-data` or `lists` APIs, we store `email_uid_${email}` → `uid` in KV. This lets us look up a user's FCM token by email for list share and export notifications.
3. **Server sends** – When an export completes, a list/pipeline is shared, or a task is due, the API calls `sendPushToEmail()` or `sendPushToUser()` from `api/lib/sendPush.js`.
4. **Task reminders** – A Vercel Cron job runs hourly (`/api/cron/task-reminders`), checks users who opted in, and sends pushes for tasks due in the next hour.

## Troubleshooting

- **No push received** – Ensure the user has enabled push in Settings and has an FCM token saved. Check that `FIREBASE_SERVICE_ACCOUNT_JSON` is set and valid.
- **"Push notifications are not configured"** – Add `VITE_FIREBASE_VAPID_KEY` to `.env.local`.
- **Export/list share works but no push** – The recipient may not have the email→uid mapping yet (they need to have signed in and used the app). Push will work once they have.
