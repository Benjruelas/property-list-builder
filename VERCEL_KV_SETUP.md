# Setting Up Vercel KV for Public Lists

This guide will help you set up Vercel KV (Redis-based key-value store) for persistent storage of public lists.

## Step 1: Install Vercel KV

The package is already added to `package.json`. Install it:

```bash
npm install
```

## Step 2: Create a Vercel KV Database

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: `property-list-builder`
3. Go to the **Storage** tab
4. Click **Create Database**
5. Select **KV** (Redis)
6. Choose a name (e.g., `public-lists-kv`) and region (choose closest to your users)
7. Click **Create**

## Step 3: Link KV to Your Project

### Option A: Via Vercel Dashboard (Recommended)

1. In your project's **Storage** tab, find your KV database
2. Click **Connect** or **Link** to link it to your project
3. This automatically adds environment variables

### Option B: Via Vercel CLI

If you prefer using the CLI:

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Link your KV database
vercel kv link
```

## Step 4: Verify Environment Variables

After linking, Vercel should automatically add these environment variables to your project:

- `KV_URL` - The connection URL for your KV database
- `KV_REST_API_URL` - REST API endpoint
- `KV_REST_API_TOKEN` - Authentication token
- `KV_REST_API_READ_ONLY_TOKEN` - Read-only token (optional)

You can verify these in:
1. Vercel Dashboard → Your Project → Settings → Environment Variables

**Note:** These variables are automatically available in your serverless functions at runtime. You don't need to manually add them to `.env` files (and shouldn't commit them).

## Step 5: Deploy

After linking the KV database:

```bash
# If using Vercel CLI
vercel --prod

# Or just push to your connected Git repository
git add .
git commit -m "Add Vercel KV for public lists persistence"
git push
```

Vercel will automatically deploy and connect to your KV database.

## Step 6: Test

1. Create a public list in your app
2. Refresh the page
3. The list should persist and still be visible

## Troubleshooting

### "KV is not available" Error

If you see errors about KV not being available:

1. **Check environment variables**: Make sure `KV_URL`, `KV_REST_API_URL`, and `KV_REST_API_TOKEN` are set in your Vercel project settings
2. **Verify linking**: Ensure the KV database is linked to your project in the Vercel dashboard
3. **Check deployment**: Redeploy your project after linking the database
4. **Local development**: For local development with `vercel dev`, KV should work automatically if linked

### Local Development

When running `vercel dev`, the KV connection should work automatically. If it doesn't:

1. Make sure you've run `vercel link` in your project directory
2. Ensure you're logged in: `vercel login`
3. Try pulling environment variables: `vercel env pull`

### Alternative: Fallback to In-Memory

If you want a fallback for development/testing without KV, the code can be modified to use in-memory storage when KV is not available. However, for production, KV is recommended for persistence.

## Cost

Vercel KV has a free tier that should be sufficient for most use cases:
- Free tier includes storage and requests suitable for development and small apps
- Check [Vercel's pricing](https://vercel.com/pricing) for production limits

## Next Steps

Once KV is set up:
- ✅ Public lists will persist across serverless function restarts
- ✅ Multiple users can share and access the same public lists
- ✅ Data is stored in Redis, providing fast access

