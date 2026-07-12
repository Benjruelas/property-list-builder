/**
 * Render self-contained HTML to a PDF buffer via headless Chromium.
 * Uses @sparticuz/chromium for Vercel serverless compatibility.
 *
 * After load, content is packed into fixed-height sheets so page 1 stays
 * top-aligned (like the link view) while subsequent pages vertically center
 * their content instead of leaving a large empty region at the bottom.
 */

import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { QUOTE_PDF_VIEWPORT } from './publicDocumentHtml.js'
import { packBlockHeights } from './pdfPagePack.js'

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

async function waitForImages(page) {
  await page.evaluate(async () => {
    const images = Array.from(document.images || [])
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve()
        return new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true })
          img.addEventListener('error', resolve, { once: true })
        })
      }),
    )
  })
}

/**
 * Pack [data-pdf-block] nodes into fixed-height .pdf-sheet pages.
 * Page 1 is top-aligned; later pages are vertically centered.
 */
async function paginateIntoCenteredSheets(page, pageHeight) {
  await page.evaluate((pageHeightPx, packFnSource) => {
    // Recreate packer in the browser context.
    // eslint-disable-next-line no-new-func
    const packBlockHeights = new Function(`return (${packFnSource})`)()

    const root = document.querySelector('.page')
    if (!root) return

    const blocks = Array.from(document.querySelectorAll('[data-pdf-block]'))
    if (!blocks.length) return

    const sheetPad = 40 // matches ~1.25rem top+bottom padding on .pdf-sheet
    const usable = Math.max(120, pageHeightPx - sheetPad)
    const heights = blocks.map((el) => el.getBoundingClientRect().height)
    const pages = packBlockHeights(heights, usable)
    if (!pages.length) return

    function appendBlock(target, el, state) {
      const group = el.getAttribute('data-pdf-group')
      if (!group) {
        target.appendChild(el)
        return
      }

      if (!state.sectionsWrap) {
        state.sectionsWrap = document.createElement('div')
        state.sectionsWrap.className = 'sections'
        target.appendChild(state.sectionsWrap)
      }

      const safeGroup = (window.CSS && CSS.escape) ? CSS.escape(group) : group.replace(/"/g, '\\"')
      let section = state.sectionsWrap.querySelector(`[data-pdf-section="${safeGroup}"]`)
      if (!section) {
        section = document.createElement('section')
        section.className = 'section-card'
        section.setAttribute('data-pdf-section', group)
        state.sectionsWrap.appendChild(section)
      }

      if (el.classList.contains('photo-row') || el.classList.contains('empty-photos')) {
        let grid = section.querySelector('.photo-grid')
        if (!grid) {
          grid = document.createElement('div')
          grid.className = 'photo-grid'
          section.appendChild(grid)
        }
        grid.appendChild(el)
        return
      }

      section.appendChild(el)
    }

    const shell = document.createElement('div')
    shell.className = 'pdf-shell'

    pages.forEach((indices, pageIndex) => {
      const sheet = document.createElement('div')
      sheet.className = pageIndex === 0 ? 'pdf-sheet' : 'pdf-sheet pdf-sheet--centered'
      const inner = document.createElement('div')
      inner.className = 'pdf-sheet__inner'

      const content = document.createElement('div')
      content.className = 'content'
      const state = { sectionsWrap: null }
      let contentUsed = false

      indices.forEach((idx) => {
        const el = blocks[idx]
        if (!el) return
        const isChrome = el.classList.contains('quote-brand-header')
        if (isChrome) {
          inner.appendChild(el)
          return
        }
        contentUsed = true
        appendBlock(content, el, state)
      })

      if (contentUsed) inner.appendChild(content)
      sheet.appendChild(inner)
      shell.appendChild(sheet)
    })

    root.replaceWith(shell)
  }, pageHeight, packBlockHeights.toString())
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
    await page.setContent(html, { waitUntil, timeout: 60_000 })
    await waitForImages(page)
    await paginateIntoCenteredSheets(page, Math.round(viewport.height))

    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
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
