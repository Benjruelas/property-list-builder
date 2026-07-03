/**
 * Firebase Google redirect sign-in embeds https://<authDomain>/ in a hidden
 * iframe from /__/auth/handler. Any X-Frame-Options (including cached DENY)
 * on the SPA shell breaks OAuth and shows chrome-error://chromewebdata/.
 *
 * For iframe navigations to /, serve index.html with framing-safe headers only.
 */
export const config = {
  matcher: '/',
}

export default async function middleware(request) {
  if (request.headers.get('sec-fetch-dest') !== 'iframe') {
    return
  }

  const url = new URL(request.url)
  const indexUrl = new URL('/index.html', url.origin)

  let html
  try {
    const upstream = await fetch(indexUrl.toString(), {
      headers: { accept: 'text/html' },
    })
    if (!upstream.ok) return
    html = await upstream.text()
  } catch {
    return
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
