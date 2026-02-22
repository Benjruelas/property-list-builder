# SkipSherpa API Setup

This guide will help you set up SkipSherpa API for skip tracing.

## Step 1: Get SkipSherpa API Credentials

1. Sign up for a SkipSherpa account at [skipsherpa.com](https://skipsherpa.com)
2. Navigate to your account settings/dashboard
3. Generate your API key (Bearer token)
4. Add `SKIPSHERPA_API_KEY` to your Vercel project environment variables (Settings → Environment Variables)

## Step 2: Set Environment Variables

For **local development** (`.env.local`):
```bash
SKIPSHERPA_API_KEY=your_skipsherpa_api_key_here
```

For **Vercel production**:
1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add `SKIPSHERPA_API_KEY` with your API key
4. Select **Production** environment (and **Preview** if needed)

**Optional**: You can override the API base URL (default: https://skipsherpa.com):
```bash
SKIPSHERPA_API_BASE=https://skipsherpa.com
```

## Step 3: Configure API Provider

The app uses SkipSherpa by default. To switch to Tracerfy (if needed), set:
```bash
USE_TRACERFY=true  # Only set this if you want to use Tracerfy instead
```

**Note**: Tracerfy endpoints are disabled by default. They require `USE_TRACERFY=true` to be enabled.

## Step 4: Test the Integration

1. Start your development server: `npm run dev`
2. Sign in to the app
3. Click on a parcel and click "Get Contact" or use bulk skip trace on a list
4. Check the browser console for API responses

## API Documentation

For detailed API documentation, visit: [skipsherpa.com/api/docs#/](https://skipsherpa.com/api/docs#/)

**Note**: The implementation may need adjustments based on the actual SkipSherpa API response format. Check the API documentation and update the response parsing in:
- `api/skip-trace-sherpa.js` - Request format
- `api/skip-trace-status-sherpa.js` - Response parsing

## Troubleshooting

### "Skip tracing service not configured"
- Make sure `SKIPSHERPA_API_KEY` is set in your environment variables
- Restart your dev server after adding environment variables

### API Response Format Issues
- Check the SkipSherpa API documentation for the exact response format
- Update the response parsing in `api/skip-trace-status-sherpa.js` to match actual API responses
- Check browser console for API response logs

### Switching Back to Tracerfy
- Set `USE_TRACERFY=true` in environment variables
- Make sure `TRACERFY_API_KEY` is set
- Restart your server
