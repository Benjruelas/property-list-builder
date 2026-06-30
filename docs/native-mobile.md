# Native mobile (Capacitor)

KnockScout ships as a Vite + React PWA and can run inside a Capacitor native shell for iOS and Android. The native app adds **one-tap save to Photos/Gallery** for lead and deal images (with OS permission prompts).

## One-time setup

```bash
npm install
npm run build
npx cap sync
```

Open the native IDE:

```bash
npm run cap:ios      # Xcode
npm run cap:android  # Android Studio
```

After web changes, rebuild and sync:

```bash
npm run cap:sync
```

## API URL for native builds

Capacitor serves the bundled app from `capacitor://localhost`, so API calls cannot use `window.location.origin`. Set the production API base in `.env.production` or CI:

```bash
VITE_API_URL=https://your-production-host.vercel.app/api
```

The shared helper `src/utils/apiBase.js` routes:

- **Dev:** `/api` (Vite proxy)
- **Native:** `VITE_API_URL` (falls back to the production Vercel host)
- **Web prod:** `${window.location.origin}/api`

## Photo save behavior

| Environment | Image save |
|-------------|------------|
| Desktop web | File download |
| Mobile web / PWA | Share sheet → “Save Image” |
| Capacitor iOS/Android | Direct save to Photos/Gallery |

Implementation: `FilePreviewOverlay` → `saveBlobToDevice()` → `savePhotoNative.js` (`@capacitor-community/media`).

## Store permissions (already configured)

**iOS** (`ios/App/App/Info.plist`):

- `NSPhotoLibraryAddUsageDescription` — “KnockScout saves property photos to your library when you tap Save.”

**Android:** Non-gallery mode — only `INTERNET` is required; the Media plugin writes to the app’s album without broad storage permissions.

## Manual QA

1. Desktop Chrome — Save photo → file downloads.
2. iOS Safari (web) — Share sheet → Save Image.
3. iOS Capacitor — First save → permission prompt → photo in Photos.
4. iOS Capacitor — Deny permission → error toast + Settings hint.
5. Android Capacitor — Save photo → appears in Gallery.
