/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogContent } from '../dialog'

describe('DialogContent overlay layering', () => {
  it('keeps nested topLayer create panels above their own scrim', () => {
    document.body.innerHTML = '<div id="modal-root"></div>'

    render(
      <Dialog open modal={false}>
        <DialogContent
          className="map-panel list-panel create-lead-panel fullscreen-panel"
          showCloseButton={false}
          nestedOverlay
          topLayer
        >
          <div>Create Lead</div>
        </DialogContent>
      </Dialog>,
    )

    const backdrop = document.querySelector('[data-app-dialog-backdrop]')
    const panel = document.querySelector('.create-lead-panel')
    expect(backdrop).toBeTruthy()
    expect(panel).toBeTruthy()
    expect(backdrop.className).toContain('z-[10020]')
    expect(panel.className).toContain('z-[10021]')
    expect(backdrop.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps new-task panels above their own scrim', () => {
    document.body.innerHTML = '<div id="modal-root"></div>'

    render(
      <Dialog open modal={false}>
        <DialogContent
          className="map-panel list-panel new-task-panel fullscreen-panel"
          showCloseButton={false}
          nestedOverlay
          topLayer
        >
          <div>New task</div>
        </DialogContent>
      </Dialog>,
    )

    const backdrop = document.querySelector('[data-app-dialog-backdrop]')
    const panel = document.querySelector('.new-task-panel')
    expect(backdrop.className).toContain('z-[10020]')
    expect(panel.className).toContain('z-[10021]')
  })
})
