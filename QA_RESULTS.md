# QA Results — Feature Verification Test Plan

Run date: 2026-04-18
Runner: automated portions executed via shell + curl against `vercel dev` on port 3001; manual browser portions documented as **MANUAL** with the artifacts needed to execute them.

Legend: PASS = automated check green. MANUAL = requires a human in a browser (I cannot drive the map UI, Firebase popup, push prompt, or service-worker lifecycle). FAIL = automated check red.

---

## 0. Automated pre-flight — PASS (with 1 finding)

| Check | Result |
|---|---|
| `npm run build` exits 0 | PASS — 1874 modules, 3.17s, no `Could not resolve`, no duplicate-JSX-attribute warnings |
| `npm run lint` | N/A — no lint script in `package.json` |
| `rg console\.log\( src api` returns zero | **FAIL (1 hit)** — [src/components/SkipTracedListPanel.jsx](src/components/SkipTracedListPanel.jsx):21 still has `console.log('📋 Loaded skip traced list:', skipTraced)`. This was reintroduced when the file was restored via `git checkout HEAD --` after the earlier over-deletion. Fix with a one-line removal. |
| `rg ParcelDetailsV[1245]\|ParcelPopupV[2345]\|ParcelPopupOriginal src` returns zero | PASS |
| `rg "from './components/ParcelDetails'" src` returns zero | PASS — now resolves to `./components/parcel-details` |
| `'Open Sans Bold'` replaced with `'Open Sans Semibold'` | PASS — both occurrences in [src/components/PMTilesParcelLayer.jsx](src/components/PMTilesParcelLayer.jsx) lines 336, 512 |
| `demotiles.maplibre.org` only in the `glyphs:` line | PASS — [src/App.jsx](src/App.jsx):138 |

API smoke (`vercel dev --listen 3001`, all 10 endpoints):

| Endpoint | Method | Auth | Result |
|---|---|---|---|
| `/api/firebase-init` | GET | none | **200** application/json |
| `/api/tiles?z=14&x=3821&y=6624` | GET | none | **200** application/x-protobuf |
| `/api/hail-events?lat=32.78&lng=-96.80` | GET | none | **200** (29 events, keys `lat/lng/radius_miles/summary/events`) |
| `/api/user-data` | GET | Bearer `dev-bypass` | **200** |
| `/api/lists` | GET | Bearer `dev-bypass` | **200** |
| `/api/pipelines` | GET | Bearer `dev-bypass` | **200** |
| `/api/paths` | GET | Bearer `dev-bypass` | **200** |
| `/api/validate-share-email?email=dev2@localhost` | GET | Bearer `dev-bypass` | **200** |
| `/api/skip-trace-sherpa` | POST | Bearer `dev-bypass` | **503** (disabled by default; expected) |
| `/api/skip-trace-status-sherpa?jobId=foo` | GET | Bearer `dev-bypass` | **503** (disabled by default; expected) |

Additional CRUD smoke:

| Flow | Result |
|---|---|
| Lists: POST → PATCH (rename) → PATCH (add parcel) → DELETE | all 200 |
| Pipelines: POST (2 columns) → PATCH (add lead) → DELETE | all 200 |
| Paths: POST → DELETE | all 200 |
| `/api/skip-trace-batchdata` POST `{parcels:[]}` | 400 `{"error":"Parcels array is required"}` — input validation intact |
| `/api/skip-trace` (Tracerfy) POST | 503 — disabled by default (expected) |
| `/api/export-list` POST `{}` | 400 — rejects missing body |
| `/api/push-subscribe` DELETE `{endpoint: "…"}` | 200 |
| `/api/push-subscribe` POST `{}` | 400 — rejects malformed subscription |
| `/api/user-data` PATCH `{appSettings:{qaTestFlag:true}}` → GET | 200 → blob contains `appSettings.qaTestFlag: true` (allowlist merge works) |
| `/api/user-data` PATCH non-allowlisted key | 200 but key dropped (allowlist enforced) |
| `/api/hail-events` second request (cache warm) | 791 ms (cache path hit) |
| `/api/solar-imagery` GET | 200 (Google Solar key present) |
| `/api/sentinel-imagery` GET | 200 (Copernicus key present) |

---

## 1. Auth — MANUAL (static imports verified)

Static checks (PASS):
- [src/contexts/AuthContext.jsx](src/contexts/AuthContext.jsx) imports all expected Firebase primitives: `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `GoogleAuthProvider`, `signOut`, `sendPasswordResetEmail`.
- [src/components/Login.jsx](src/components/Login.jsx) wires `login` + `signInWithGoogle` from `useAuth()`.
- `mergeBlobToLocal` + `clearLocalBlobKeys` present in [src/utils/userDataSync.js](src/utils/userDataSync.js) (unexported internals, still invoked inside the module).

Manual run required for:
- Email/password sign-in, Google OAuth popup, sign-up, forgot-password email delivery, sign-out clearing, re-sign-in restoring blob.

---

## 2. Map, parcels, address search — MANUAL (static verified)

Static (PASS):
- Glyph server + fontstack alignment: `glyphs` URL ([src/App.jsx](src/App.jsx):138) + `'Open Sans Semibold'` at [src/components/PMTilesParcelLayer.jsx](src/components/PMTilesParcelLayer.jsx):336,512 — demotiles hosts this fontstack, so no more 404s for glyph ranges.
- Mapbox token read points: [src/App.jsx](src/App.jsx):82, [src/components/AddressSearch.jsx](src/components/AddressSearch.jsx):22, [src/utils/reverseGeocode.js](src/utils/reverseGeocode.js):5 — all read `VITE_MAPBOX_ACCESS_TOKEN`.
- ParcelDetails import chain: `import { ParcelDetailsV3 as ParcelDetails } from './components/parcel-details'` → `index.jsx` re-exports `ParcelDetailsV3` from `./ParcelDetailsV3`. Component signature preserved (`{ isOpen, onClose, parcelData, ... }`).

Manual run required for:
- Permission prompt grant/deny paths, pan/zoom, parcel click-to-popup, multi-select, compass rotation + NorthIndicator, address-search fly-to.

---

## 3. Property Lists — PASS (API) / MANUAL (UI)

API cycle (PASS, see §0). Manual UI run required for: list highlight count cap, CSV export email delivery (Resend), share-to-user-B visibility.

---

## 4. Deal Pipeline / Leads / Tasks / Schedule — PASS (API) / MANUAL (UI)

API cycle (PASS, see §0). Manual UI run required for: drag-drop, ConvertToLeadPipelineDialog, schedule picker, task reminders, cross-pipeline LeadsPanel search.

---

## 5. Skip Tracing — PASS (static + provider gating) / MANUAL (E2E)

Static (PASS):
- No `apiToken.substring` / `token.startsWith` / PII-console calls remain in [api/skip-trace-batchdata.js](api/skip-trace-batchdata.js) (earlier cleanup regression guard).
- SkipSherpa + Tracerfy gated 503 when disabled (confirmed via curl).
- BatchData validates input (`400` on empty parcels).

Manual run required for: live skip trace job against real BatchData credentials, result ingestion, edit/delete flows, SkipTracedListPanel.

---

## 6. GPS Path Tracking — PASS (API) / MANUAL (UI)

API cycle (POST/DELETE) green. Manual run required for: live geolocation recording, glow animation, Kalman smoothing, share flow, distance-unit toggle in Settings.

---

## 7. Roof Inspector — PASS (API) / MANUAL (UI)

API surfaces all 200 (solar, sentinel, hail-events). Hail-events cache confirmed hot on second request. Manual run required for: Google Solar image zoom/pan, historical timeline scrubber, hail-year expansion, Claude AI roof analysis (live call), Roof Report PDF download.

---

## 8. Email & SMS — MANUAL (static verified)

Static (PASS):
- `tel:`/`sms:` URI construction in [src/components/PhoneActionPanel.jsx](src/components/PhoneActionPanel.jsx) lines 24, 33–34.
- Template CRUD exports: `getEmailTemplates/addEmailTemplate/updateEmailTemplate/deleteEmailTemplate` in [src/utils/emailTemplates.js](src/utils/emailTemplates.js); `getTextTemplates/addTextTemplate` in [src/utils/textTemplates.js](src/utils/textTemplates.js).
- Resend surface reachable via [api/export-list.js](api/export-list.js) (returns 400 on empty body, i.e. handler loads and parses).

Manual run required for: actual email send (Resend delivery), merge-tag substitution visual, `sms:`/`tel:` launching system composer.

---

## 9. Notifications — MANUAL

Static: [public/sw.js](public/sw.js), [src/utils/pushNotifications.js](src/utils/pushNotifications.js), [api/push-subscribe.js](api/push-subscribe.js) POST/DELETE contracts verified (400 on malformed, 200 on unsubscribe of unknown endpoint).

Manual run required for: VAPID subscribe flow, push delivery for list/pipeline share + task reminders, master-toggle behavior, re-grant idempotency.

---

## 10. Data sync — PASS (API) / MANUAL (cross-device)

Allowlist-based merge confirmed via PATCH+GET cycle (§0). Non-allowlisted keys are silently dropped — this is intentional per [api/user-data.js](api/user-data.js) lines 116–125.

Manual run required for: debounce timing (~1.5s) in browser devtools, cross-device merge, concurrent-tab merge, offline survivability.

---

## 11. Settings, permissions, onboarding — MANUAL

Static: references confirmed for `DEV_PERSONA_STORAGE_KEY`, `WelcomeTour`, `appSettings` in [src/utils/devPersona.js](src/utils/devPersona.js), [src/components/WelcomeTour.jsx](src/components/WelcomeTour.jsx), [src/utils/settings.js](src/utils/settings.js), [src/components/SettingsPanel.jsx](src/components/SettingsPanel.jsx).

Manual run required for: first-run tour, permission prompt on iOS, dev persona switch reload behavior, map style / distance unit / reminder offsets.

---

## 12. Offline / error resilience — MANUAL

Static: [src/components/ErrorBoundary.jsx](src/components/ErrorBoundary.jsx) wired in [src/main.jsx](src/main.jsx); geolocation `timeout: 10000` at [src/App.jsx](src/App.jsx):457,495 matches the error you saw earlier (`GeolocationPositionError code 3`), and the `watchPosition` error handler is non-fatal — it only logs and leaves `userLocation` intact.

Manual run required for: devtools-offline walkthrough, ErrorBoundary fallback render (throw from a panel), geolocation timeout soak test.

---

## 13. Final regression sweep — PASS

- Post-test `npm run build`: still green, 3.17s, identical warning set (only the pre-existing dynamic+static import info notes + >500KB chunk note).
- `git status --short`: no new modifications from this test run (all diffs are from prior cleanup session). Test run did **not** mutate source files.
- Font 404 regression: `'Open Sans Bold'` references are gone; only `'Open Sans Semibold'` remains.
- Deleted component identifiers: zero references.
- `console.log` in src/api: **1 remaining** — the SkipTracedListPanel entry noted in §0 (pre-existing, restored with the file).

---

## Summary

| Section | Status |
|---|---|
| 0. Automated pre-flight | PASS (1 minor finding) |
| 1. Auth | MANUAL |
| 2. Map/parcels | MANUAL (static PASS) |
| 3. Lists | PASS (API) / MANUAL (UI) |
| 4. Pipeline/Leads/Tasks | PASS (API) / MANUAL (UI) |
| 5. Skip Trace | PASS (static) / MANUAL (E2E) |
| 6. Paths | PASS (API) / MANUAL (UI) |
| 7. Roof Inspector | PASS (API) / MANUAL (UI) |
| 8. Email & SMS | MANUAL (static PASS) |
| 9. Notifications | MANUAL |
| 10. Data sync | PASS (API) / MANUAL (cross-device) |
| 11. Settings/onboarding | MANUAL |
| 12. Offline/errors | MANUAL |
| 13. Final sweep | PASS |

### Findings requiring action

1. **Stale `console.log` in [src/components/SkipTracedListPanel.jsx](src/components/SkipTracedListPanel.jsx):21** — the cleanup invariant says zero `console.log` in `src/` + `api/`. Delete the line.

### Observations (no action required, called out for awareness)

- `api/user-data.js` PATCH is **allowlist-based** (keys outside `dealPipelineColumns, dealPipelineLeads, dealPipelineTitle, leadTasks, parcelNotes, skipTracedParcels, emailTemplates, textTemplates, skipTraceJobs, skipTracedList, appSettings` are silently dropped). Good for safety, but any future client code writing a new key must add it to the allowlist.
- Vite build still reports the mixed static/dynamic import notes for `skipTrace.js` and `emailTemplates.js` — low-priority cleanup (these two are both statically and dynamically imported by `App.jsx`, so the dynamic import doesn't move them into a separate chunk).
- Bundle chunks exceed 500KB (informational, not a failure).

### Manual walkthrough checklist (for the human runner)

Use the plan at `.cursor/plans/feature_verification_test_plan_*.plan.md` for the full per-step sequences. Two accounts required: `dev-bypass` (User A) and `dev-bypass-2` (User B), switchable from Settings > Local dev user in dev builds.
