# Export List Setup

This guide explains how to set up the "Export list" feature, which converts a property list to CSV and emails it to the logged-in user.

## How It Works

1. User clicks "Export list" from the list options dropdown (⋮) or from the ParcelListPanel header
2. The list is converted to a CSV with property data and skip trace info (when available)
3. The CSV is sent as an email attachment to the user's logged-in email address
4. Uses [Resend](https://resend.com) for email delivery

## Step 1: Get Resend API Key

1. Sign up at [resend.com](https://resend.com) (free tier: 100 emails/day)
2. Go to **API Keys** in the Resend dashboard
3. Create a new API key
4. Copy the key (starts with `re_`)

## Step 2: Set Environment Variables

**For Vercel production:**

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add `RESEND_API_KEY` with your Resend API key
3. Select **Production** (and **Preview** if needed)

**For local development** (`.env.local`):

```bash
RESEND_API_KEY=re_your_api_key_here
```

When using `vercel dev`, the API routes will have access to these env vars.

## CSV Columns

The exported CSV includes:
- Address, City, State, Zip (parsed from property address)
- Owner Name
- Mailing Address, Mailing City, Mailing State, Mailing Zip (parsed from parcel MAIL_ADDR / MAILING_ADDR)

## Notes

- Users must be signed in to export; the CSV is sent to their logged-in email
- Resend's free tier sends from `onboarding@resend.dev`; for a custom domain, verify it in Resend
- If `RESEND_API_KEY` is not set, the export will fail with a clear error message
