# Local Development Environment Setup

When developing locally with serverless functions, you need to use `vercel dev` instead of `npm run dev` to access environment variables.

## The Problem

- `.env.local` is read by **Vite** (client-side code) but NOT by Vercel serverless functions
- Vercel serverless functions running locally need environment variables passed differently
- `npm run dev` only runs Vite's dev server, which doesn't load env vars for serverless functions

## Solution: Use `vercel dev`

For local development with serverless functions, run:

```bash
vercel dev
```

This will:
1. Start Vercel's development server
2. Load environment variables from `.env.local` for serverless functions
3. Proxy API requests to local serverless functions with proper env vars

## Environment Variables Setup

### For Local Development

Your `.env.local` file should contain:

```bash
# Client-side (Vite) - loaded automatically
VITE_MAPBOX_ACCESS_TOKEN=your_token
VITE_FIREBASE_API_KEY=your_key
# ... other VITE_* variables

# Server-side (Serverless Functions) - loaded by vercel dev
GOOGLE_MAPS_TILES_KEY=your_google_map_tiles_key
SKIPSHERPA_API_KEY=your_api_key
TRACERFY_API_KEY=your_api_key
REDIS_URL=your_redis_url
# Optional: dedicated Mapbox token for /api/share-card satellite previews.
# Falls back to VITE_MAPBOX_ACCESS_TOKEN when unset.
MAPBOX_ACCESS_TOKEN=your_token
```

### For Production (Vercel)

Add all environment variables in Vercel Dashboard:
1. Go to your project settings
2. Navigate to **Environment Variables**
3. Add:
   - `GOOGLE_MAPS_TILES_KEY` = Google Cloud API key with **Map Tiles API** enabled (primary basemap)
   - `VITE_MAPBOX_ACCESS_TOKEN` = Mapbox token (geocoding + basemap fallback)
   - `MAPBOX_ACCESS_TOKEN` = optional server Mapbox token for Lead/Deal share link preview cards (falls back to `VITE_MAPBOX_ACCESS_TOKEN`)
   - `SKIPSHERPA_API_KEY` = your API key
   - `VITE_FIREBASE_API_KEY` = your Firebase key
   - Any other variables you need

4. Verify Google basemap session on production:
   ```bash
   curl -s "https://YOUR_DOMAIN/api/google-tiles-session?mapType=satellite" | head -c 200
   ```
   Expect JSON with `tileUrl` and `expiry`. If you see `GOOGLE_MAPS_TILES_KEY not configured`, add the key in Vercel and redeploy.

## Quick Start

1. Make sure you have the Vercel CLI installed:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Link your project (if not already linked):
   ```bash
   vercel link
   ```

4. Start development server:
   ```bash
   vercel dev
   ```

5. Your app will be available at `http://localhost:3000` (or the port Vercel assigns)

## Alternative: Pure Vite Dev (without serverless functions)

If you want to test client-side only (without serverless functions), you can use:
```bash
npm run dev
```

But note that API calls will fail since serverless functions won't have environment variables.

## Troubleshooting

### Testing list/pipe sharing with two local users

- Open **Settings** and use **Local dev user**: **User A** (`dev@localhost`) vs **User B** (`dev2@localhost`). Switching reloads the app and uses a different API identity (`dev-bypass` vs `dev-bypass-2`).
- For side-by-side sessions, use two browser profiles (or normal + incognito) and set each to a different persona so both users are signed in at once.
- You can also set `localStorage.setItem('knockscout_dev_persona', '2')` and reload (use `'1'` for User A).

### Phone testing on the same Wi‑Fi (dev@localhost not on your team)

When you open dev on your phone via your Mac’s LAN IP (e.g. `http://192.168.1.42:3000`), the UI still shows `dev@localhost`, but the API must accept the synthetic dev token for that host. Recent builds treat private LAN IPs the same as `localhost` for dev bypass.

If team membership still looks wrong on the phone:

1. Confirm the phone URL uses the same dev server as your Mac (not a stale preview deploy).
2. Restart `vercel dev` after pulling changes.
3. Hard-refresh the phone browser (or clear site data for that host).
4. Optional fallback: add `ENABLE_DEV_BYPASS=true` to `.env.local` and restart the dev server.

Both Mac (`localhost`) and phone (`192.168.x.x`) must hit the **same** Redis/KV-backed team data — if one device uses `npm run dev` without the API proxy, team calls will fail silently.

### "Bearer token" / "Unauthorized" when creating lists
- **Use `vercel dev`** not `npm run dev` – the API serverless functions only run under vercel dev
- If using `vercel dev` and still getting 401, add to `.env.local`:
  ```
  ENABLE_DEV_BYPASS=true
  ```
  This forces the dev-bypass token to be accepted regardless of host

### "Skip tracing service not configured"
- Make sure you're using `vercel dev` not `npm run dev`
- Check that `SKIPSHERPA_API_KEY` is in your `.env.local`
- Restart `vercel dev` after adding environment variables

### Environment variables not loading
- Ensure `.env.local` is in the project root (not in `src/` or `api/`)
- Check that variable names match exactly (case-sensitive)
- Restart `vercel dev` after changes
