# Firebase Authentication Setup

This guide will help you set up Firebase Authentication for email/password and Google sign-in.

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard:
   - Enter a project name
   - Enable/disable Google Analytics (optional)
   - Click "Create project"

## Step 2: Enable Authentication

1. In your Firebase project, go to **Authentication** in the left sidebar
2. Click **Get Started**
3. Enable the following sign-in methods:
   - **Email/Password**: Click on it, toggle "Enable", and click "Save"
   - **Google**: Click on it, toggle "Enable", enter your project support email, and click "Save"

## Step 3: Get Your Firebase Configuration

1. In Firebase Console, click the gear icon ⚙️ next to "Project Overview"
2. Select **Project settings**
3. Scroll down to "Your apps" section
4. If you don't have a web app, click the **</>** (web) icon to add one
5. Register your app with a nickname (e.g., "Property List Builder")
6. Copy the Firebase configuration object (it looks like this):

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
}
```

## Step 4: Set Environment Variables

Create a `.env.local` file in your project root (if it doesn't exist) and add your Firebase configuration:

```bash
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

**Important**: 
- Never commit `.env.local` to git (it should already be in `.gitignore`)
- For production (Vercel), add these same variables in your Vercel project settings under "Environment Variables"

## Step 5: Configure Authorized Domains (for Google Sign-In)

1. In Firebase Console, go to **Authentication** → **Settings** → **Authorized domains**
2. Add your production domain (e.g., `your-app.vercel.app`)
3. Local development domains (`localhost`) are added by default

## Step 6: Test the Setup

1. Start your development server: `npm run dev`
2. Click the user icon in the top right
3. Try signing up with email/password
4. Try signing in with Google

## Troubleshooting

### "Firebase: Error (auth/unauthorized-domain)"
- Make sure your domain is added to Authorized domains in Firebase Console

### "Firebase: Error (auth/api-key-not-valid)"
- Check that your environment variables are set correctly
- Restart your dev server after adding environment variables

### Google Sign-In not working
- Ensure Google sign-in method is enabled in Firebase Console
- Check that your project support email is set
- Verify authorized domains include your current domain

## Security Notes

- Firebase handles all authentication securely
- Passwords are never stored in plain text
- Google OAuth uses secure popup flows
- All authentication state is managed by Firebase SDK

## Free Tier Limits

Firebase Authentication free tier includes:
- Unlimited users
- Email/password authentication
- Google, Facebook, Twitter, and more providers
- Phone authentication (with quotas)
- Custom authentication

Perfect for development and small to medium production apps!
