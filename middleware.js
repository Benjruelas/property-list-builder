/**
 * Firebase Google redirect sign-in embeds https://<authDomain>/ in a hidden
 * iframe from /__/auth/handler. Any X-Frame-Options (including cached DENY)
 * on the SPA shell breaks OAuth and shows chrome-error://chromewebdata/.
 *
 * For iframe navigations to /, serve a blank shell (not the full app) so OAuth
 * never flashes KnockScout or Firebase links inside the relay iframe.
 */
const AUTH_IFRAME_SHELL = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'

export const config = {
  matcher: '/',
}

export default async function middleware(request) {
  if (request.headers.get('sec-fetch-dest') !== 'iframe') {
    return
  }

  return new Response(AUTH_IFRAME_SHELL, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
