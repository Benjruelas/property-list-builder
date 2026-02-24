# Download Source Code from Vercel Production

Your production deployment ID: `dpl_pk9qXmDwjhD6iGkGL9ZXaSeQnF8U`

## Steps

### 1. Get a Vercel token
1. Go to https://vercel.com/account/tokens
2. Create a new token (e.g. "Download source")
3. Copy the token

### 2. Run the download script
```bash
# From project root - replace YOUR_TOKEN with your actual token
VERCEL_TOKEN="YOUR_TOKEN" ./scripts/download-from-vercel.sh
```

### 3. Review the downloaded files
The source will be in `./production-backup`. Compare with your local files and merge what you need.

**Note:** This only works if the deployment was created via Vercel CLI. If you deployed from Git, Vercel may not have the source files stored.
