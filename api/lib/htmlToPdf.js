/**
 * Render self-contained HTML to a PDF buffer via headless Chromium.
 * Uses @sparticuz/chromium for Vercel serverless compatibility.
 */

import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

let _browserPromise = null

async function getBrowser() {
  if (_browserPromise) {
    try {
      const existing = await _browserPromise
      if (existing?.connected) return existing
    } catch {
      _browserPromise = null
    }
  }

  _browserPromise = (async () => {
    const executablePath = await chromium.executablePath()
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: {
        width: 820,
        height: 1100,
        deviceScaleFactor: 1,
      },
      executablePath,
      headless: chromium.headless,
      acceptInsecureCerts: true,
    })
  })()

  try {
    return await _browserPromise
  } catch (err) {
    _browserPromise = null
    throw err
  }
}

/**
 * @param {string} html
 * @param {{ waitUntil?: string }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function htmlToPdfBuffer(html, { waitUntil = 'networkidle0' } = {}) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    // Images are inlined as data URIs; domcontentloaded is enough for quotes.
    await page.setContent(html, { waitUntil, timeout: 60_000 })
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      // Margins come from the document @page rule to match the HTML layout.
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return Buffer.from(pdf)
  } finally {
    await page.close().catch(() => {})
  }
}

/** Test/helper hook to drop a cached browser between runs. */
export async function closeHtmlToPdfBrowser() {
  if (!_browserPromise) return
  try {
    const browser = await _browserPromise
    await browser.close()
  } catch {
    /* ignore */
  } finally {
    _browserPromise = null
  }
}
