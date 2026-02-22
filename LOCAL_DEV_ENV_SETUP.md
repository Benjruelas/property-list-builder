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
SKIPSHERPA_API_KEY=your_api_key
TRACERFY_API_KEY=your_api_key
REDIS_URL=your_redis_url
```

### For Production (Vercel)

Add all environment variables in Vercel Dashboard:
1. Go to your project settings
2. Navigate to **Environment Variables**
3. Add:
   - `SKIPSHERPA_API_KEY` = your API key
   - `VITE_FIREBASE_API_KEY` = your Firebase key
   - `VITE_MAPBOX_ACCESS_TOKEN` = your Mapbox token
   - Any other variables you need

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

### "Skip tracing service not configured"
- Make sure you're using `vercel dev` not `npm run dev`
- Check that `SKIPSHERPA_API_KEY` is in your `.env.local`
- Restart `vercel dev` after adding environment variables

### Environment variables not loading
- Ensure `.env.local` is in the project root (not in `src/` or `api/`)
- Check that variable names match exactly (case-sensitive)
- Restart `vercel dev` after changes
