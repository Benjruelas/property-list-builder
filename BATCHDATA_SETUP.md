# BatchData API Setup with OAuth 2.0

This guide will help you set up BatchData API for skip tracing with OAuth 2.0 authentication.

## Step 1: Get BatchData OAuth 2.0 Credentials

1. Sign up for a BatchData account at [batchdata.com](https://batchdata.com)
2. Navigate to your account settings/dashboard
3. Create an OAuth 2.0 application to get:
   - **Client ID** (`BATCHDATA_CLIENT_ID`)
   - **Client Secret** (`BATCHDATA_CLIENT_SECRET`)
4. Alternatively, you can use an API Key (`BATCHDATA_API_KEY`) if OAuth 2.0 is not available

## Step 2: Set Environment Variables

For **local development** (`.env.local`):
```bash
# OAuth 2.0 (recommended)
BATCHDATA_CLIENT_ID=your_client_id_here
BATCHDATA_CLIENT_SECRET=your_client_secret_here

# OR use API Key (fallback)
BATCHDATA_API_KEY=your_api_key_here
```

For **Vercel production**:
1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add:
   - `BATCHDATA_CLIENT_ID` = your OAuth client ID
   - `BATCHDATA_CLIENT_SECRET` = your OAuth client secret
   - OR `BATCHDATA_API_KEY` = your API key (if not using OAuth)
4. Select **Production** environment (and **Preview** if needed)

**Optional**: You can override the API base URL (default: https://api.batchdata.com/api/v3):
```bash
BATCHDATA_API_BASE=https://api.batchdata.com/api/v3
```

**Optional**: You can override the OAuth token endpoint (default: https://api.batchdata.com/oauth/token):
```bash
BATCHDATA_AUTH_BASE=https://api.batchdata.com
```

**Optional**: You can override the endpoint paths:
```bash
# Async endpoint (default, used for batch operations)
BATCHDATA_ENDPOINT=https://api.batchdata.com/api/v3/property/skip-trace/async
# Sync endpoint (for single requests)
# BATCHDATA_ENDPOINT=https://api.batchdata.com/api/v3/property/skip-trace
# Status endpoint (check API docs for exact path)
BATCHDATA_STATUS_ENDPOINT=https://api.batchdata.com/api/v3/property/skip-trace/{jobId}
```

## Step 3: Configure API Provider

The app uses BatchData by default. To switch to SkipSherpa or Tracerfy (if needed), set:
```bash
VITE_SKIP_TRACE_PROVIDER=sherpa  # or 'tracerfy'
```

**Note**: 
- SkipSherpa endpoints are disabled by default (require `USE_SKIPSHERPA=true`)
- Tracerfy endpoints are disabled by default (require `USE_TRACERFY=true`)

## Step 4: Test the Integration

1. Start your development server: `vercel dev` (not `npm run dev`)
2. Sign in to the app
3. Click on a parcel and click "Get Contact" or use bulk skip trace on a list
4. Check the browser console and terminal for API responses

## Authentication

The implementation uses **API Key authentication** with Bearer token format:

1. **API Key**: Use your BatchData API key from the dashboard
2. **Token Format**: The code uses `Authorization: Bearer <YOUR_TOKEN>` format
   - Testing shows that Bearer format is required (direct token returns 401)
   - The token must have skip-trace permissions enabled in your BatchData account
3. **Environment Variable**: Set `BATCHDATA_API_KEY` in `.env.local` for local dev or Vercel environment variables for production

**Important**: Ensure your API token has the correct permissions:
- Log into your [BatchData Dashboard](https://developer.batchdata.com/docs/batchdata/welcome-to-batchdata)
- Navigate to API Keys/Settings
- Verify your token has **skip-trace** or **property skip-trace** permissions enabled
- If you get a 403 error, the token is valid but lacks the required permissions

## API Documentation

For detailed API documentation, visit: [BatchData API Docs](https://developer.batchdata.com/docs/batchdata/batchdata-v3/operations/create-a-property-skip-trace-async)

**Important**: The implementation may need adjustments based on the actual BatchData API:
- OAuth token endpoint path
- Request body format
- Response structure
- Endpoint paths
- Field names in responses

Check the API documentation and update:
- `api/skip-trace-batchdata.js` - OAuth flow and request format
- `api/skip-trace-status-batchdata.js` - Response parsing and status endpoint

## Troubleshooting

### "Skip tracing service not configured"
- Make sure `BATCHDATA_CLIENT_ID` and `BATCHDATA_CLIENT_SECRET` (or `BATCHDATA_API_KEY`) are set in your environment variables
- For local dev, use `vercel dev` instead of `npm run dev`
- Restart `vercel dev` after adding environment variables

### "Failed to get OAuth token"
- Verify your Client ID and Client Secret are correct
- Check that the OAuth token endpoint is correct (default: `https://api.batchdata.com/oauth/token`)
- Check BatchData API docs for the correct OAuth endpoint
- The implementation will fall back to API key if OAuth fails

### "Invalid token" or 401/403 errors
- **401 "Invalid token"**: The token format is incorrect or the token is invalid
  - The code uses `Bearer <TOKEN>` format by default
  - Verify your `BATCHDATA_API_KEY` is correct in `.env.local`
  - Restart `vercel dev` after updating environment variables
  
- **403 "Provided token does not have permission"**: The token is valid but lacks permissions
  - This means the Bearer format is correct, but the token needs proper permissions
  - Log into your [BatchData Dashboard](https://developer.batchdata.com/docs/batchdata/welcome-to-batchdata)
  - Check your API token settings and ensure it has **skip-trace permissions** enabled
  - Verify the token is for the correct API version (v3)
  - You may need to create a new token with the appropriate permissions/scopes

### API Response Format Issues
- Check the BatchData API documentation for the exact response format
- Update the response parsing in `api/skip-trace-status-batchdata.js` to match actual API responses
- Check browser console and terminal for API response logs

### 404 or Wrong Endpoint
- Check the BatchData API docs for the correct endpoint path
- You can override the endpoint using `BATCHDATA_ENDPOINT` environment variable
- The default endpoint is `/api/v3/property/skip-trace/async` - adjust based on docs
