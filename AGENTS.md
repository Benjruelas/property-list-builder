# AGENTS.md

## Cursor Cloud specific instructions

KnockScout is a single product: a mobile-first React 18 + Vite SPA/PWA with a
Vercel serverless API (`api/*`, Node ESM) and Capacitor iOS/Android wrappers.
Package manager is **npm** (`package-lock.json`). See `README.md`, `.env.example`,
and `LOCAL_DEV_ENV_SETUP.md` for product details.

### Running it (dev)
- `npm run dev` starts the Vite SPA **and** serves the `/api/*` serverless
  handlers in-process (via `scripts/viteApiDevPlugin.js`) on **port 3000**. You do
  NOT need `vercel dev` for local dev — `LOCAL_DEV_ENV_SETUP.md` predates the dev
  plugin. Only top-level `api/<route>.js` handlers are served by the plugin;
  nested `/api/a/b` paths fall through to the `:3001` proxy (run `npm run dev:api`
  only if you need those).
- Standard scripts are in `package.json`: `npm test` (Vitest, ~777 tests),
  `npm run build` (Vite production build), `npm run preview`.
- There is **no lint script / ESLint config** in this repo. CI (`.github/workflows/ci.yml`)
  runs `npm test`, `npm run build`, and `npm audit --audit-level=high` on Node 24.
  Local dev works fine on the sandbox's Node 22 LTS (deps require Node 18+).

### Auth & storage in local dev (no external services required)
- The client bypasses Firebase entirely in dev (`import.meta.env.DEV`): it is
  auto-signed-in as synthetic user `dev@localhost`, and the API accepts the
  synthetic token `Authorization: Bearer dev-bypass` (see `src/contexts/AuthContext.jsx`
  and `api/_lib/devBypassUsers.js`). `.env.local` also sets `ENABLE_DEV_BYPASS=true`.
- GOTCHA: `src/config/firebase.js` calls `getAuth()` at import time, which throws
  `auth/invalid-api-key` and blanks the whole app when `VITE_FIREBASE_API_KEY` is
  **empty**. A non-empty *dummy* value is enough to boot (no real Firebase needed).
  This is why `.env.local` (gitignored) sets a dummy `VITE_FIREBASE_API_KEY`; the
  update script recreates `.env.local` if it is missing.
- With no KV/Redis configured, the API persists to an in-memory + on-disk fallback
  under `.local-dev-data/` (gitignored). Data lasts for the dev-server session.
  `GET /api/health` returning `"kvNote":"no_kv_configured"` is expected.

### Expected local-dev noise (NOT bugs)
- Console `409 (Conflict)` errors on `/api/user-data` are by-design optimistic-
  concurrency responses (versioned sync in `api/user-data.js`); the client
  reconciles them automatically (`src/utils/userDataSync.js`). Non-fatal.
- Without a map-tile credential (`GOOGLE_MAPS_TILES_KEY` or `VITE_MAPBOX_ACCESS_TOKEN`),
  the basemap never reaches `ready`, so the **map area renders black** and the
  full-screen `AppLoadingScreen` (spinning 3D-cube) **flashes briefly after data
  writes** (each user-data sync re-triggers the basemap load — see
  `src/hooks/useBasemapStyle.js` and `showAppLoading` in `src/App.jsx`). This is
  NOT a crash; the app settles back. Provide a Mapbox token (or Google Map Tiles
  key) for a clean map and to stop the loader flashes. Data CRUD works fully
  without it (e.g. creating a task returns `POST /api/tasks` 201 and renders on the
  Schedule calendar).

### Optional secrets for fuller functionality
All are documented in `.env.example`. None are required to boot or to test core
CRUD. Add as Cursor secrets (server vars) or in `.env.local` (`VITE_*` client vars):
`VITE_MAPBOX_ACCESS_TOKEN` / `GOOGLE_MAPS_TILES_KEY` (map + geocoding),
`REDIS_URL` or `KV_REST_API_*` (real persistence), plus feature keys (Stripe,
Resend, Anthropic, skip-trace providers, etc.).
