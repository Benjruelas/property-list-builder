/**
 * Google OAuth redirect target for iOS Home Screen PWA handoff.
 *
 * The Home Screen app top-level-navigates to accounts.google.com; Google then
 * returns here with ?code=&state=. We exchange the code (PKCE), mint a Firebase
 * custom token (KV + inline sign-in), and send the user back into KnockScout.
 *
 * Do not use window.open/Safari sheets for this flow — iOS reclaims same-origin
 * returns and drops the OAuth code.
 */

import {
  HANDOFF_TTL_SEC,
  exchangeGoogleAuthCode,
  googleOAuthRedirectUri,
  handoffKvKey,
  kvDelKey,
  kvGetJson,
  kvSetJsonEx,
  mintFirebaseCustomTokenForGoogleProfile,
  resolveGoogleOAuthWebClientId,
  storageAvailable,
  verifyGoogleIdTokenClaims,
} from './_lib/googleHandoff.js'
import { getAppOrigin } from './_lib/firebaseAdmin.js'

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function firebaseWebConfig() {
  return {
    apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '',
    authDomain: (
      process.env.VITE_FIREBASE_AUTH_DOMAIN
      || process.env.FIREBASE_AUTH_DOMAIN
      || 'knockscout.app'
    ).replace(/^https?:\/\//, '').replace(/\/$/, ''),
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',
    appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || '',
  }
}

function renderResultHtml({
  title,
  copy,
  ok,
  customToken = '',
  appOrigin = getAppOrigin(),
}) {
  const cfg = firebaseWebConfig()
  const openHref = `${String(appOrigin).replace(/\/$/, '')}/`
  const tokenJson = JSON.stringify(String(customToken || ''))
  const cfgJson = JSON.stringify(cfg)
  const statusLabel = ok ? 'Signed in' : 'Sign-in issue'
  const spinOrCheck = ok
    ? '<div class="ks-check" aria-hidden="true">✓</div>'
    : '<div class="ks-spin" aria-hidden="true"></div>'

  const autoSignScript = ok && customToken && cfg.apiKey
    ? `
<script type="module">
  const customToken = ${tokenJson};
  const firebaseConfig = ${cfgJson};
  const homeUrl = ${JSON.stringify(openHref)};
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js');
    const { getAuth, setPersistence, browserLocalPersistence, signInWithCustomToken } =
      await import('https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js');
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
    await signInWithCustomToken(auth, customToken);
    try {
      localStorage.removeItem('knockscout.googleHandoff.v1');
      sessionStorage.removeItem('knockscout.googleHandoff.v1');
    } catch (_) {}
    const el = document.getElementById('ks-auto');
    if (el) el.textContent = 'Signed in — opening KnockScout…';
    window.location.replace(homeUrl);
  } catch (err) {
    console.warn('[google-oauth-callback] auto sign-in', err);
    const el = document.getElementById('ks-auto');
    if (el) el.textContent = 'Tap Open KnockScout below to finish.';
  }
</script>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex"/>
  <title>KnockScout · ${escapeHtml(statusLabel)}</title>
  <style>
    html,body{margin:0;background:#0a0a0a;color:#fff;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:14px;padding:28px 20px;text-align:center;box-sizing:border-box}
    img{width:48px;height:48px}
    .ks-brand{font-size:18px;font-weight:600;letter-spacing:-0.02em;margin:0}
    .ks-title{font-size:16px;font-weight:600;margin:8px 0 0}
    .ks-copy{font-size:14px;line-height:1.45;color:rgba(255,255,255,.72);margin:0;max-width:28rem}
    .ks-auto{font-size:13px;line-height:1.4;color:rgba(255,255,255,.55);margin:0;max-width:28rem}
    .ks-spin{width:28px;height:28px;border:2px solid rgba(125,211,252,.25);border-top-color:#7dd3fc;
      border-radius:50%;animation:ks-spin .8s linear infinite;margin-top:4px}
    .ks-check{width:36px;height:36px;border-radius:50%;background:#16a34a;color:#fff;display:flex;
      align-items:center;justify-content:center;font-size:18px;font-weight:700;margin-top:4px}
    a.ks-open{margin-top:16px;display:inline-flex;align-items:center;justify-content:center;
      padding:12px 18px;border-radius:8px;background:#2563eb;color:#fff;font-size:15px;font-weight:600;
      text-decoration:none}
    @keyframes ks-spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <main role="status" aria-live="polite">
    <img src="/brand/emblem-white.svg" alt="" width="48" height="48"/>
    <p class="ks-brand">KnockScout</p>
    ${spinOrCheck}
    <p class="ks-title">${escapeHtml(title)}</p>
    <p class="ks-copy">${escapeHtml(copy)}</p>
    <p class="ks-auto" id="ks-auto"></p>
    <a class="ks-open" href="${escapeHtml(openHref)}">Open KnockScout</a>
  </main>
  ${autoSignScript}
</body>
</html>`
}

function sendHtml(res, status, html) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.end(html)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const appOrigin = getAppOrigin()
  const q = req.query || {}

  if (q.error) {
    return sendHtml(res, 200, renderResultHtml({
      ok: false,
      title: 'Google sign-in cancelled',
      copy: 'Return to the KnockScout Home Screen app and try again.',
      appOrigin,
    }))
  }

  const code = String(q.code || '').trim()
  const handoffId = String(q.state || '').trim()
  if (!code || !handoffId) {
    return sendHtml(res, 400, renderResultHtml({
      ok: false,
      title: 'Sign-in link incomplete',
      copy: 'Return to KnockScout and start Google sign-in again.',
      appOrigin,
    }))
  }

  if (!storageAvailable()) {
    return sendHtml(res, 503, renderResultHtml({
      ok: false,
      title: 'Sign-in temporarily unavailable',
      copy: 'Please try again in a moment from the KnockScout app.',
      appOrigin,
    }))
  }

  const key = handoffKvKey(handoffId)
  const session = await kvGetJson(key)
  if (!session || session.status !== 'pending' || !session.pkceVerifier) {
    return sendHtml(res, 410, renderResultHtml({
      ok: false,
      title: 'This sign-in expired',
      copy: 'Return to the KnockScout Home Screen app and try Google sign-in again.',
      appOrigin,
    }))
  }

  try {
    const clientId = await resolveGoogleOAuthWebClientId()
    if (!clientId) {
      return sendHtml(res, 503, renderResultHtml({
        ok: false,
        title: 'Google sign-in is not configured',
        copy: 'Ask your admin to set GOOGLE_OAUTH_WEB_CLIENT_ID.',
        appOrigin,
      }))
    }

    const redirectUri = googleOAuthRedirectUri(appOrigin)
    const tokens = await exchangeGoogleAuthCode({
      code,
      redirectUri,
      codeVerifier: session.pkceVerifier,
    })

    const idToken = String(tokens.id_token || '').trim()
    if (!idToken) {
      throw new Error('Google did not return an ID token')
    }

    const profile = await verifyGoogleIdTokenClaims(idToken, clientId)
    const { uid, customToken } = await mintFirebaseCustomTokenForGoogleProfile(profile)

    const saved = await kvSetJsonEx(
      key,
      {
        status: 'ready',
        pollTokenHash: session.pollTokenHash,
        customToken,
        uid,
        createdAt: session.createdAt,
        completedAt: Date.now(),
      },
      HANDOFF_TTL_SEC,
    )
    if (!saved) {
      return sendHtml(res, 503, renderResultHtml({
        ok: false,
        title: 'Could not save sign-in',
        copy: 'Return to KnockScout and try again.',
        appOrigin,
      }))
    }

    return sendHtml(res, 200, renderResultHtml({
      ok: true,
      title: 'You are signed in',
      copy: 'Finishing sign-in and returning to KnockScout…',
      customToken,
      appOrigin,
    }))
  } catch (err) {
    console.error('[auth-google-oauth-callback]', err?.message || err)
    // Leave session pending briefly so a retry from Google is unlikely; clear verifier abuse path.
    try {
      await kvDelKey(key)
    } catch {
      /* ignore */
    }
    return sendHtml(res, 500, renderResultHtml({
      ok: false,
      title: 'Google sign-in failed',
      copy: 'Return to the KnockScout Home Screen app and try again.',
      appOrigin,
    }))
  }
}
