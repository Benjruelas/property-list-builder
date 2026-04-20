# Knockscout

A mobile-first field canvassing and property intelligence platform built with React, Leaflet, and Vercel serverless functions. Designed for door-to-door sales teams, roofing contractors, and real estate professionals who need to identify properties, gather owner contact info, manage leads, and generate roof measurement reports -- all from the field.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Features](#features)
  - [Interactive Map & Parcels](#interactive-map--parcels)
  - [Property Lists](#property-lists)
  - [Skip Tracing](#skip-tracing)
  - [Deal Pipeline (CRM)](#deal-pipeline-crm)
  - [Tasks & Scheduling](#tasks--scheduling)
  - [Email & SMS](#email--sms)
  - [GPS Path Tracking](#gps-path-tracking)
  - [Roof Inspector](#roof-inspector)
  - [Compass & Orientation](#compass--orientation)
  - [Notifications](#notifications)
  - [Data Sync](#data-sync)
- [API Endpoints](#api-endpoints)
- [Component Reference](#component-reference)
- [Utilities Reference](#utilities-reference)
- [Contexts & Hooks](#contexts--hooks)
- [Styling & Design System](#styling--design-system)
- [Deployment](#deployment)

---

## Architecture Overview

```
Browser (React SPA)
├── Leaflet Map + PMTiles vector parcels
├── Firebase Auth (email/password, Google)
├── Panels & Dialogs (lists, pipeline, leads, paths, settings, ...)
└── User data blob (localStorage + server sync)

Vercel Serverless Functions (/api/*)
├── Authenticated CRUD (lists, paths, pipelines, user-data)
├── Tile proxy with R2 caching
├── Skip trace integrations (BatchData, SkipSherpa, Tracerfy)
├── Roof analysis (Google Solar API, Sentinel imagery, Claude AI)
├── Web Push notifications
└── CSV export via Resend email

External Services
├── Firebase Auth (identity)
├── Vercel KV / Redis (persistent storage)
├── Cloudflare R2 (tile cache, imagery cache)
├── LandRecords.us (nationwide parcel vector tiles)
├── Google Solar API (roof imagery + DSM)
├── Esri World Imagery Wayback (historical satellite)
├── SPC/NOAA (hail event data)
├── Anthropic Claude (AI roof analysis)
├── Mapbox (geocoding)
├── Resend (transactional email)
└── BatchData / SkipSherpa / Tracerfy (skip tracing)
```

**Data flow:** The client authenticates via Firebase, then makes API calls to `/api/*` routes with a `Bearer` token. Serverless functions verify the token against Firebase, then read/write to Vercel KV. Heavy operations (tiles, imagery, reports) use Cloudflare R2 as a cache layer. User-scoped data (skip trace results, notes, templates, settings) syncs between `localStorage` and the server via a debounced merge mechanism.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS 3 |
| Map | Leaflet + react-leaflet + leaflet-rotate |
| Parcel tiles | PMTiles, @mapbox/vector-tile, pbf |
| UI primitives | Radix UI (Dialog), Lucide React icons, CVA (class-variance-authority) |
| Auth | Firebase Authentication (email/password + Google OAuth) |
| Backend | Vercel Serverless Functions (Node.js) |
| Storage | Vercel KV (Redis-compatible), Cloudflare R2 (S3-compatible) |
| Email | Resend API |
| PDF | PDFKit + Sharp (server-side image processing) |
| AI | Anthropic Claude (multimodal vision) |
| Push | Web Push API + web-push library |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Firebase project (for auth)
- Vercel account (for deployment + KV)

### Installation

```bash
git clone <repo-url>
cd property-list-builder
npm install
```

### Development

```bash
npm run dev          # Vite dev server on http://localhost:3000
npm run dev:vercel   # Full Vercel dev (includes serverless functions)
npm run build        # Production build
npm run preview      # Preview production build
```

The Vite dev server proxies `/api` requests to the Vercel dev server and proxies `/__/auth` to Firebase for custom auth domain support.

---

## Environment Variables

Create a `.env.local` file. See `.env.example` for the full template.

### Firebase (required)

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
FIREBASE_API_KEY=              # Server-side token verification
```

### Parcel Tiles (required for map parcels)

```
LANDRECORDS_API_KEY=           # LandRecords.us API key
LANDRECORDS_TILE_URL=          # PBF tile endpoint URL
```

### Cloudflare R2 (required for tile/imagery caching)

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=parcel-tiles
```

### Vercel KV (required for data persistence)

```
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

### Web Push Notifications (optional)

```
VITE_VAPID_PUBLIC_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
```

### Roof Inspector (optional)

```
GOOGLE_SOLAR_API_KEY=          # Google Solar API for roof imagery
COPERNICUS_CLIENT_ID=          # Sentinel Hub historical imagery
COPERNICUS_CLIENT_SECRET=
ANTHROPIC_API_KEY=             # Claude AI for roof condition analysis
```

### Skip Tracing (optional, providers disabled by default)

```
BATCHDATA_API_KEY=             # BatchData skip tracing
USE_SKIPSHERPA=true            # Enable SkipSherpa
SKIPSHERPA_API_KEY=
USE_TRACERFY=true              # Enable Tracerfy
TRACERFY_API_KEY=
```

### Email (optional)

```
RESEND_API_KEY=                # Resend for transactional email
```

### Geocoding

```
VITE_MAPBOX_ACCESS_TOKEN=      # Mapbox geocoding (address search)
```

---

## Project Structure

```
property_list_builder/
├── api/                          # Vercel serverless functions
│   ├── lists.js                  # Property list CRUD + sharing
│   ├── paths.js                  # GPS path CRUD + sharing
│   ├── pipelines.js              # Deal pipeline CRUD + collaboration
│   ├── user-data.js              # Per-user JSON blob (settings, notes, etc.)
│   ├── tiles.js                  # Parcel tile proxy with R2 cache
│   ├── hail-events.js            # NOAA/SPC hail history with monthly cache
│   ├── solar-imagery.js          # Google Solar API roof imagery
│   ├── sentinel-imagery.js       # Historical satellite imagery (Esri Wayback)
│   ├── roof-report.js            # Full PDF roof measurement report
│   ├── roof-analysis.js          # AI roof condition assessment (Claude)
│   ├── skip-trace.js             # Tracerfy skip trace
│   ├── skip-trace-batchdata.js   # BatchData skip trace
│   ├── skip-trace-sherpa.js      # SkipSherpa skip trace
│   ├── skip-trace-status*.js     # Job polling for each provider
│   ├── export-list.js            # CSV email export via Resend
│   ├── push-subscribe.js         # Web Push subscription management
│   ├── push-utils.js             # Shared push notification helpers
│   ├── validate-share-email.js   # Email validation for list/pipeline sharing
│   ├── public-lists.js           # Global public property lists
│   ├── firebase-init.js          # Firebase web config endpoint
│   └── firebase-auth-proxy.js    # Auth domain proxy for custom domains
│
├── src/
│   ├── main.jsx                  # Entry point: service worker, React root
│   ├── App.jsx                   # Root component: all state, map, panels
│   ├── index.css                 # Global styles + design system
│   │
│   ├── components/
│   │   ├── PMTilesParcelLayer.jsx  # Vector tile parcel rendering
│   │   ├── MapControls.jsx         # Map toolbar (zoom, compass, menu)
│   │   ├── AddressSearch.jsx       # Geocoding search bar
│   │   ├── CompassOrientation.jsx  # Device heading → map rotation
│   │   ├── NorthIndicator.jsx      # North arrow on rotated map
│   │   ├── PathTracker.jsx         # GPS path recording polyline
│   │   ├── ParcelDetails.jsx       # Property info panel
│   │   ├── ListPanel.jsx           # Property lists management
│   │   ├── ParcelListPanel.jsx     # Parcels within a list
│   │   ├── PathsPanel.jsx          # Saved GPS paths
│   │   ├── DealPipeline.jsx        # Kanban-style CRM board
│   │   ├── LeadsPanel.jsx          # Cross-pipeline lead browser
│   │   ├── LeadDetails.jsx         # Individual lead detail sheet
│   │   ├── SchedulePanel.jsx       # Calendar/agenda for tasks
│   │   ├── TasksPanel.jsx          # Task list panel
│   │   ├── RoofInspectorPanel.jsx  # Roof imagery + hail + reports
│   │   ├── SettingsPanel.jsx       # App settings
│   │   ├── EmailComposer.jsx       # Single email compose
│   │   ├── BulkEmailPreview.jsx    # Bulk email preview + send
│   │   ├── EmailTemplatesPanel.jsx # Email template editor
│   │   ├── TextTemplatesPanel.jsx  # SMS template editor
│   │   ├── PhoneActionPanel.jsx    # Call/SMS quick actions
│   │   ├── SkipTracedListPanel.jsx # Skip-traced contacts list
│   │   ├── ConvertToLeadPipelineDialog.jsx # Pipeline picker
│   │   ├── Login.jsx / SignUp.jsx / ForgotPassword.jsx # Auth UI
│   │   ├── PermissionPrompt.jsx    # Location/orientation permissions
│   │   ├── NotificationPrompt.jsx  # Push notification opt-in
│   │   ├── WelcomeTour.jsx         # First-run onboarding tour
│   │   ├── ErrorBoundary.jsx       # React error boundary
│   │   ├── MapOverlayPane.jsx      # Map HUD overlay
│   │   ├── ParcelLayer.jsx         # Legacy GeoJSON layer (unused)
│   │   └── ui/                     # Shared UI primitives
│   │       ├── button.jsx          # CVA-styled button
│   │       ├── dialog.jsx          # Radix dialog wrapper
│   │       ├── input.jsx           # Text input
│   │       ├── toast.jsx           # Toast notification system
│   │       └── confirm-dialog.jsx  # Programmatic confirm modal
│   │
│   ├── utils/
│   │   ├── lists.js                # API client: lists CRUD
│   │   ├── paths.js                # API client: paths CRUD + sharing
│   │   ├── pipelines.js            # API client: pipelines CRUD + permissions
│   │   ├── publicLists.js          # API client: public lists
│   │   ├── skipTrace.js            # Skip trace API + local storage
│   │   ├── skipTraceJobs.js        # Pending job tracking
│   │   ├── skipTracedList.js       # Skip-traced parcel list
│   │   ├── dealPipeline.js         # Local pipeline data + address helpers
│   │   ├── leadTasks.js            # Task CRUD, grouping, formatting
│   │   ├── emailTemplates.js       # Email template CRUD + tag replacement
│   │   ├── textTemplates.js        # SMS template CRUD
│   │   ├── exportList.js           # CSV generation
│   │   ├── parcelNotes.js          # Per-parcel notes
│   │   ├── settings.js             # App settings (get/update/defaults)
│   │   ├── userDataSync.js         # Bidirectional server sync
│   │   ├── pushNotifications.js    # Web Push subscribe/unsubscribe
│   │   ├── geoUtils.js             # Haversine distance, bounds check
│   │   └── pathSmoothing.js        # Kalman filter + path distance calc
│   │
│   ├── contexts/
│   │   ├── AuthContext.jsx         # Firebase auth provider + hooks
│   │   └── UserDataSyncContext.jsx # Data sync scheduler context
│   │
│   ├── hooks/
│   │   └── useDeviceHeading.js     # Device compass heading hook
│   │
│   ├── config/
│   │   └── firebase.js             # Firebase app + auth initialization
│   │
│   └── lib/
│       └── utils.js                # cn() classname merge helper
│
├── public/
│   └── sw.js                       # Service worker
│
├── package.json                    # Dependencies + scripts
├── vite.config.js                  # Vite config + dev proxies
├── vercel.json                     # Deployment config + function limits
├── tailwind.config.js              # Tailwind theme
├── postcss.config.js               # PostCSS pipeline
├── .env.example                    # Environment variable template
└── index.html                      # SPA shell
```

---

## Features

### Interactive Map & Parcels

**Files:** `src/App.jsx`, `src/components/PMTilesParcelLayer.jsx`, `src/components/MapControls.jsx`, `src/components/AddressSearch.jsx`, `api/tiles.js`

The map uses **Leaflet** with the **leaflet-rotate** plugin for compass-based rotation. Parcel boundaries are rendered from **vector tiles** (PBF format) sourced from LandRecords.us, proxied through `api/tiles.js` which caches tiles in Cloudflare R2 for zero-egress re-serving.

`PMTilesParcelLayer` decodes vector tiles using `@mapbox/vector-tile` and `pbf`, converts them to Leaflet polygons, and handles hit-testing, selection highlighting, and list-color overlays. Tiles are loaded on demand based on the current viewport and zoom level.

**Map layers:**
- **Street view:** CARTO Voyager raster tiles
- **Satellite view:** Esri World Imagery + optional label overlays
- **Parcels:** Vector tile polygons with click interaction
- **GPS paths:** Recorded polylines with glow effects
- **User location:** Custom arrow marker showing heading direction

**Address search** uses the Mapbox Geocoding API to fly the map to searched locations.

### Property Lists

**Files:** `src/components/ListPanel.jsx`, `src/components/ParcelListPanel.jsx`, `src/utils/lists.js`, `api/lists.js`

Users create named lists and add parcels to them from the map. Lists are stored in Vercel KV, scoped to the authenticated user. Features include:

- Create, rename, and delete lists
- Add/remove parcels (single or multi-select)
- Highlight up to 20 lists on the map simultaneously (color-coded)
- Share lists with other users by email
- Bulk skip trace all parcels in a list
- Export lists as CSV (emailed via Resend)
- View parcels within a list with expandable property details

The API (`api/lists.js`) supports GET/POST/PATCH/DELETE with Firebase token auth. Shared lists appear in recipients' list panels with a "shared with you" indicator.

### Skip Tracing

**Files:** `src/utils/skipTrace.js`, `src/utils/skipTraceJobs.js`, `src/utils/skipTracedList.js`, `api/skip-trace-batchdata.js`, `api/skip-trace-sherpa.js`, `api/skip-trace.js`, `api/skip-trace-status*.js`

Skip tracing looks up property owner contact information (phone numbers, emails, mailing addresses). Three providers are supported:

1. **BatchData** -- primary provider, async job-based
2. **SkipSherpa** -- opt-in (`USE_SKIPSHERPA=true`)
3. **Tracerfy** -- opt-in (`USE_TRACERFY=true`)

The flow: submit parcel data to the skip trace API, receive a job ID, poll for completion, then store results locally and sync to the server. Results include phone numbers and emails with verification status and primary contact indicators. Users can manually add/edit/remove contacts after skip tracing.

### Deal Pipeline (CRM)

**Files:** `src/components/DealPipeline.jsx`, `src/components/LeadsPanel.jsx`, `src/components/LeadDetails.jsx`, `src/components/ConvertToLeadPipelineDialog.jsx`, `src/utils/dealPipeline.js`, `src/utils/pipelines.js`, `api/pipelines.js`

A Kanban-style CRM board for managing leads through customizable stages. Key features:

- Multiple pipelines with custom columns/stages
- Drag-and-drop lead movement between stages (or dropdown selection on mobile)
- Convert any parcel to a lead with one tap
- Lead detail sheets with contact info, tasks, and "Go to Pipeline" navigation
- Pipeline sharing/collaboration with other users
- Edit mode for renaming columns, reordering, and deleting
- Cross-pipeline lead search and filtering (LeadsPanel)
- Time-in-stage tracking

Pipelines are stored in Vercel KV via `api/pipelines.js`. Lead status changes trigger Web Push notifications to pipeline collaborators.

### Tasks & Scheduling

**Files:** `src/components/TasksPanel.jsx`, `src/components/SchedulePanel.jsx`, `src/components/SchedulePicker.jsx`, `src/utils/leadTasks.js`

Tasks are attached to leads and can optionally be scheduled with a date/time. Features include:

- Create, edit, complete, and delete tasks on any lead
- Schedule tasks with date/time picker
- Calendar/agenda view (SchedulePanel) showing tasks by day
- Task deadline reminders (15m, 30m, or 1h before) via push notifications
- Tasks grouped by pipeline in the global task list
- "View on calendar" from task context menus

### Email & SMS

**Files:** `src/components/EmailComposer.jsx`, `src/components/BulkEmailPreview.jsx`, `src/components/EmailTemplatesPanel.jsx`, `src/components/TextTemplatesPanel.jsx`, `src/components/PhoneActionPanel.jsx`, `src/utils/emailTemplates.js`, `src/utils/textTemplates.js`, `api/export-list.js`

Template-based email and SMS communication with property owners:

- **Email templates** with merge tags (owner name, address, etc.) and WYSIWYG editing
- **Single email** composer pre-filled from template + parcel data
- **Bulk email** to entire lists with preview before sending
- **SMS templates** with merge tags, launched via `sms:` protocol
- **Phone actions** panel for quick call/text from skip trace results
- **CSV export** of lists emailed to the user via Resend

### GPS Path Tracking

**Files:** `src/components/PathTracker.jsx`, `src/components/PathsPanel.jsx`, `src/utils/paths.js`, `src/utils/pathSmoothing.js`, `api/paths.js`

Record walking/driving routes while canvassing:

- One-tap start/stop recording from the map toolbar
- Real-time path rendering with glow animation
- Kalman filter smoothing for clean GPS tracks
- Distance calculation (miles or km based on settings)
- Save, rename, delete, and share paths
- Toggle path visibility on the map
- Click a path to center the map on it
- Paths stored server-side with sharing support

### Roof Inspector

**Files:** `src/components/RoofInspectorPanel.jsx`, `api/solar-imagery.js`, `api/sentinel-imagery.js`, `api/hail-events.js`, `api/roof-report.js`, `api/roof-analysis.js`

Property roof analysis toolkit for roofing contractors:

- **Current Roof Image** -- high-res top-down imagery from Google Solar API, with interactive zoom/pan
- **Historical Satellite Timeline** -- yearly satellite images from Esri World Imagery Wayback, centered on the selected property with a crosshair overlay
- **Hail History** -- NOAA SPC hail events near the property, grouped by year with expandable details. Uses monthly caching (completed months cached 180 days, current month 24 hours) to handle 2025+ data efficiently
- **AI Roof Analysis** -- Claude multimodal vision assessment of roof condition
- **Roof Measurement Report** (in development) -- full PDF report with facet diagrams, measurements, and material estimates using Google Solar DSM/GeoTIFF data

### Compass & Orientation

**Files:** `src/components/CompassOrientation.jsx`, `src/components/NorthIndicator.jsx`, `src/hooks/useDeviceHeading.js`

Device compass integration for map orientation:

- `useDeviceHeading` hook reads device orientation events and provides a smoothed heading
- `CompassOrientation` rotates the Leaflet map to match the user's heading using `leaflet-rotate`
- Compass stays active during map panning (rotation persists even when auto-centering pauses)
- Tapping the compass button toggles orientation; user map interaction pauses auto-centering but keeps orientation
- `NorthIndicator` shows a north arrow when the map is rotated

### Notifications

**Files:** `src/components/NotificationPrompt.jsx`, `src/utils/pushNotifications.js`, `api/push-subscribe.js`, `api/push-utils.js`

Web Push notifications for collaborative features:

- Push subscription management via VAPID keys
- Notifications for: list shares, pipeline shares, lead status changes, task deadline reminders
- Configurable notification settings (master toggle, per-feature toggles)
- Settings hidden when master notification toggle is off

### Data Sync

**Files:** `src/utils/userDataSync.js`, `src/contexts/UserDataSyncContext.jsx`, `api/user-data.js`

Bidirectional sync between `localStorage` and the server:

- **Local-first:** All user data (skip trace results, notes, templates, settings, tasks) is stored in `localStorage` for instant access
- **Server sync:** On login, the server blob is merged into local storage. Changes are debounced (~1.5s) and PATCHed to `/api/user-data`
- **Merge strategy:** `mergeBlobToLocal` handles key-by-key merging to avoid overwriting concurrent changes
- `UserDataSyncProvider` context exposes `scheduleSync()` for any component to trigger a sync after local writes

---

## API Endpoints

All endpoints require `Authorization: Bearer <Firebase ID token>` unless noted. On localhost, dev bypass tokens are accepted: `dev-bypass` (User A, `dev@localhost`) and `dev-bypass-2` (User B, `dev2@localhost`). In the Settings panel (dev builds), **Local dev user** switches persona and reloads the app.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/lists` | Fetch user's lists (owned + shared) |
| POST | `/api/lists` | Create a new list |
| PATCH | `/api/lists` | Update list (add/remove parcels, rename, share) |
| DELETE | `/api/lists` | Delete a list |
| GET | `/api/paths` | Fetch user's paths (owned + shared) |
| POST | `/api/paths` | Save a new GPS path |
| PATCH | `/api/paths` | Rename or share a path |
| DELETE | `/api/paths` | Delete a path |
| GET | `/api/pipelines` | Fetch user's pipelines (owned + shared) |
| POST | `/api/pipelines` | Create a pipeline |
| PATCH | `/api/pipelines` | Update pipeline (leads, columns, title, share) |
| DELETE | `/api/pipelines` | Delete a pipeline |
| GET | `/api/user-data` | Fetch user's synced data blob |
| PATCH | `/api/user-data` | Merge updates into user's data blob |
| GET | `/api/tiles?z=&x=&y=` | Parcel vector tile (PBF), R2-cached |
| GET | `/api/hail-events?lat=&lng=` | Hail history near coordinates |
| GET | `/api/solar-imagery?lat=&lng=` | Google Solar roof imagery |
| GET | `/api/sentinel-imagery?lat=&lng=` | Historical satellite imagery |
| POST | `/api/roof-report` | Generate PDF roof measurement report |
| POST | `/api/roof-analysis` | AI roof condition analysis |
| POST | `/api/skip-trace-batchdata` | Submit BatchData skip trace |
| GET | `/api/skip-trace-status-batchdata?jobId=` | Poll BatchData job |
| POST | `/api/skip-trace-sherpa` | Submit SkipSherpa skip trace |
| GET | `/api/skip-trace-status-sherpa?jobId=` | Poll SkipSherpa job |
| POST | `/api/export-list` | Email CSV export |
| POST | `/api/push-subscribe` | Save push subscription |
| DELETE | `/api/push-subscribe` | Remove push subscription |
| GET | `/api/validate-share-email?email=` | Check if email belongs to a user |

---

## Component Reference

### Map & Interaction

| Component | Purpose |
|-----------|---------|
| `PMTilesParcelLayer` | Decodes PBF vector tiles, renders parcel polygons, handles click/selection, list color overlays |
| `MapControls` | Floating toolbar: zoom in/out, recenter, compass toggle, multi-select, path recording, hamburger menu |
| `AddressSearch` | Geocoding search bar (Mapbox API), fly-to on result selection |
| `CompassOrientation` | Reads device heading, sets Leaflet map bearing via `leaflet-rotate` |
| `NorthIndicator` | SVG north arrow displayed when map is rotated |
| `PathTracker` | Renders active GPS recording as a polyline with glow effects |
| `MapOverlayPane` | Transparent overlay for map HUD elements |

### Panels & Dialogs

| Component | Purpose |
|-----------|---------|
| `ParcelDetails` | Property info panel with owner details, actions (add to list, skip trace, convert to lead, roof inspector) |
| `ListPanel` | CRUD for property lists, highlight on map, share, bulk actions |
| `ParcelListPanel` | Browse parcels within a selected list, expand for details/actions |
| `DealPipeline` | Kanban board with draggable leads, custom columns, pipeline switcher, sharing |
| `LeadsPanel` | Search/filter/sort leads across all pipelines |
| `LeadDetails` | Lead detail sheet: contact info, tasks, "Go to Pipeline" button |
| `PathsPanel` | View/rename/share/delete GPS paths, click to center on map |
| `SchedulePanel` | Calendar/agenda view for scheduled tasks |
| `TasksPanel` | Global task list grouped by pipeline |
| `RoofInspectorPanel` | Roof imagery, hail history, AI analysis, report generation |
| `SettingsPanel` | App preferences (map style, distance units, notifications, data management) |
| `EmailComposer` | Single email composition with template merge |
| `BulkEmailPreview` | Preview and send bulk emails to a list |
| `EmailTemplatesPanel` / `TextTemplatesPanel` | Template editors for email and SMS |
| `PhoneActionPanel` | Quick call/text actions from phone numbers |
| `SkipTracedListPanel` | Browse all skip-traced contacts |
| `ConvertToLeadPipelineDialog` | Pipeline picker when converting parcel to lead |
| `WelcomeTour` | First-run onboarding walkthrough |

### Auth

| Component | Purpose |
|-----------|---------|
| `Login` | Sign-in modal (email/password + Google) |
| `SignUp` | Registration modal |
| `ForgotPassword` | Password reset form |
| `PermissionPrompt` | Location/orientation permission request UX |
| `NotificationPrompt` | Push notification opt-in prompt |

---

## Utilities Reference

| Module | Purpose |
|--------|---------|
| `lists.js` | API client for `/api/lists` -- `fetchLists`, `createList`, `updateList`, `deleteList`, `validateShareEmail` |
| `paths.js` | API client for `/api/paths` -- `fetchPaths`, `createPath`, `renamePath`, `sharePath`, `deletePath` |
| `pipelines.js` | API client for `/api/pipelines` -- `fetchPipelines`, `createPipeline`, `updatePipeline`, `deletePipeline`, permission helpers |
| `skipTrace.js` | Skip trace API calls + local contact storage -- `skipTraceParcels`, `pollSkipTraceJobUntilComplete`, `getSkipTracedParcel`, `saveSkipTracedParcel`, `updateSkipTracedContacts` |
| `skipTraceJobs.js` | Track pending skip trace jobs -- `addSkipTraceJob`, `getSkipTraceJob`, `getPendingSkipTraceJobs` |
| `dealPipeline.js` | Local pipeline helpers -- `loadLeads`, `saveLeads`, `addLead`, `isParcelALead`, `getFullAddress`, `formatTimeInState` |
| `leadTasks.js` | Task CRUD and scheduling -- `addLeadTask`, `toggleLeadTask`, `getLeadTasks`, `getAllTasks`, `groupOpenTasksByPipeline` |
| `emailTemplates.js` | Email template CRUD + `replaceTemplateTags` with merge field support |
| `textTemplates.js` | SMS template CRUD |
| `exportList.js` | `listToCsv` -- convert list data to CSV string |
| `parcelNotes.js` | Per-parcel note storage -- `getParcelNote`, `saveParcelNote` |
| `settings.js` | App settings with defaults -- `getSettings`, `updateSettings`, `DEFAULT_SETTINGS` |
| `userDataSync.js` | Server sync engine -- `loadUserData`, `saveUserData`, `scheduleUserDataSync`, `mergeBlobToLocal` |
| `pushNotifications.js` | Web Push -- `subscribeToWebPush`, `unsubscribeWebPush`, `showLocalNotification` |
| `geoUtils.js` | `distanceInMiles`, `isPointInBounds` |
| `pathSmoothing.js` | Kalman filter for GPS, `smoothPath`, `totalDistanceMiles`, `totalDistanceKm` |
| `publicLists.js` | API client for public (non-user-scoped) lists |

---

## Contexts & Hooks

### `AuthContext` (`src/contexts/AuthContext.jsx`)

Provides Firebase authentication state to the entire app.

**Value:** `currentUser`, `getToken`, `login`, `signup`, `signInWithGoogle`, `logout`, `resetPassword`, `loading`, and in dev only: `devPersona`, `switchDevPersona`, `DEV_PERSONA_A`, `DEV_PERSONA_B`.

In dev mode, skips Firebase and uses a synthetic user from `localStorage` key `property_list_builder_dev_persona` (`1` = User A + `dev-bypass`, `2` = User B + `dev-bypass-2`). Serverless functions on localhost resolve those tokens to distinct `uid`/`email` for testing sharing.

### `UserDataSyncContext` (`src/contexts/UserDataSyncContext.jsx`)

Wraps the app to provide `scheduleSync()` -- a debounced function that PATCHes the local user data blob to the server. Any component that writes to localStorage should call `scheduleSync()` afterward.

### `useDeviceHeading` (`src/hooks/useDeviceHeading.js`)

Custom hook that returns the device's compass heading (smoothed). Used by `App.jsx` to feed `CompassOrientation`. Handles iOS permission prompts for `DeviceOrientationEvent`.

---

## Styling & Design System

The app uses a **glassmorphism / "liquid glass"** design language defined in `src/index.css`:

- **`.map-panel`** -- base panel class with frosted glass backdrop blur, translucent backgrounds, and subtle borders
- **`.liquid-glass`** -- glassmorphic effect for map controls and overlays
- **`.fullscreen-panel`** -- mobile-first full-screen dialogs that become centered modals on desktop
- **CSS custom properties** -- HSL color tokens following the shadcn/ui convention (`--background`, `--primary`, `--destructive`, etc.)
- **`.map-panel-header-toolbar`** -- flex layout for panel headers with title + actions pattern
- **Scrollbar hiding** -- `.scrollbar-hide` utility for clean mobile UX
- **Safe area insets** -- `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` throughout for iPhone notch/home bar support

Map-specific styles handle selection states and Leaflet control overrides.

---

## Deployment

The app deploys to **Vercel** with automatic builds on push to `main`.

### Vercel Configuration

`vercel.json` configures:

- **Function timeouts:** Heavy endpoints (tiles, imagery, reports) get extended `maxDuration` and memory
- **Rewrites:** Firebase auth proxy routes (`/__/firebase/init.json`, `/__/auth/*`)
- **CORS headers:** Permissive headers on `/api/*` for cross-origin requests

### Required Vercel Integrations

1. **Vercel KV** -- Redis-compatible key-value store for all persistent data
2. **Environment variables** -- All variables from `.env.example` plus Firebase client config

### Deploy

```bash
# Via Vercel CLI
vercel

# Or push to main for automatic deployment
git push origin main
```

### Post-Deploy Checklist

- [ ] Firebase Auth domain includes your Vercel deployment URL
- [ ] All environment variables are set in Vercel dashboard
- [ ] Vercel KV is provisioned and connected
- [ ] R2 bucket exists with correct CORS policy
- [ ] VAPID keys generated (`npx web-push generate-vapid-keys`) if using push notifications

---

## License

MIT
