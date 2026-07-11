/**
 * Render self-contained HTML to a PDF buffer via headless Chromium.
 * Uses @sparticuz/chromium for Vercel serverless compatibility.
 */

import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { QUOTE_PDF_VIEWPORT } from './publicDocumentHtml.js'

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
        width: QUOTE_PDF_VIEWPORT.width,
        height: QUOTE_PDF_VIEWPORT.height,
        deviceScaleFactor: 2,
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
 * @param {{
 *   waitUntil?: string,
 *   viewport?: { width: number, height: number }
 * }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function htmlToPdfBuffer(html, {
  waitUntil = 'networkidle0',
  viewport = QUOTE_PDF_VIEWPORT,
} = {}) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setViewport({
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
      deviceScaleFactor: 2,
    })
    // Images are inlined as data URIs; domcontentloaded is enough for quotes.
    await page.setContent(html, { waitUntil, timeout: 60_000 })
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      // Page size/margins come from the document @page rule (column-width pages).
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
