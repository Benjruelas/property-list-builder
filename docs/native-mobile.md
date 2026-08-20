# Native mobile (Capacitor)

KnockScout ships as a Vite + React PWA and can run inside a Capacitor native shell for iOS and Android. The native app adds **one-tap save to Photos/Gallery** for lead and deal images (with OS permission prompts) and **native still photo capture** in Photo Mode (system shutter sound / lens blackout on iOS).

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

## Photo Mode camera (native stills)

On Capacitor iOS/Android, Photo Mode uses `@capacitor-community/camera-preview` with a transparent WebView overlay (`toBack: true`) so shutter uses the platform still-photo pipeline (`AVCapturePhotoOutput` / CameraX) instead of grabbing video frames. Web/PWA keeps the getUserMedia + canvas fallback.

Implementation: `src/photos/nativeCameraPreview.js` → `PhotoCaptureModal.jsx`.

**iOS rotation:** `patches/@capacitor-community+camera-preview+8.0.1.patch` keeps the native preview full-bleed during device rotation (correct `previewLayer` bounds, autoresizing through the animation, deferred `videoOrientation` update) so only the HTML chrome reflows — no black letterboxing from frame resets. `npm install` applies the patch via `postinstall` before `npx cap sync`.

## Photo save behavior

| Environment | Image save |
|-------------|------------|
| Desktop web | File download |
| Mobile web / PWA | Share sheet → “Save Image” |
| Capacitor iOS/Android | Direct save to Photos/Gallery |

Implementation: `FilePreviewOverlay` → `saveBlobToDevice()` → `savePhotoNative.js` (`@capacitor-community/media`).

## Store permissions (already configured)

**iOS** (`ios/App/App/Info.plist`):

- `NSCameraUsageDescription` — “KnockScout uses the camera to take property photos in Photo Mode.”
- `NSPhotoLibraryAddUsageDescription` — “KnockScout saves property photos to your library when you tap Save.”

**Android** (`android/app/src/main/AndroidManifest.xml`):

- `CAMERA` — required for Photo Mode native capture
- Non-gallery Media mode — only `INTERNET` is required for saving to the app album (no broad storage permission)

## Manual QA

1. Desktop Chrome — Save photo → file downloads.
2. iOS Safari (web) — Share sheet → Save Image.
3. iOS Capacitor — First save → permission prompt → photo in Photos.
4. iOS Capacitor — Deny permission → error toast + Settings hint.
5. Android Capacitor — Save photo → appears in Gallery.
6. iOS Capacitor Photo Mode — Take photo → system shutter sound + brief blackout; rotate portrait↔landscape with chrome clear of notch; Done restores opaque UI.
7. Android Capacitor Photo Mode — Take photo → still JPEG enqueued; flip / flash / pinch zoom work.
