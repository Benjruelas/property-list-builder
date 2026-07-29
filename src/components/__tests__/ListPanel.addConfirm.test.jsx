/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ListPanel } from '../ListPanel'

vi.mock('../ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="list-panel">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
}))

vi.mock('../ui/panel-header', () => ({
  PanelHeader: ({ children, title }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
  PANEL_LIST_HEADER_CLASS: '',
  PANEL_LIST_HEADER_STYLE: {},
  PanelCreateButton: () => <button type="button">Create</button>,
}))

vi.mock('../ui/button', () => ({
  Button: ({ children, ...props }) => <button type="button" {...props}>{children}</button>,
}))

vi.mock('../ui/OptionsMenuDropdown', () => ({
  OptionsMenuDropdown: () => null,
  OptionsMenuItem: () => null,
}))

vi.mock('../CreateListDialog', () => ({
  CreateListDialog: () => null,
}))

vi.mock('../ShareResourceDialog', () => ({
  ShareResourceDialog: () => null,
}))

vi.mock('../ResourceSharePicker', () => ({
  LeadSharingIcon: () => null,
}))

vi.mock('../tags/PanelFilterMenu', () => ({
  PanelFilterMenu: () => null,
}))

vi.mock('../tags/EntityTagPills', () => ({
  EntityTagPills: () => null,
}))

vi.mock('../tags/TagPicker', () => ({
  TagPicker: () => null,
}))

vi.mock('../ui/toast', () => ({
  showToast: vi.fn(),
}))

vi.mock('../ui/panelDialogUtils', () => ({
  ignoreRadixMapPanelDismiss: () => {},
}))

const lists = [
  {
    id: 'list-a',
    name: 'Alpha List',
    ownerId: 'user-1',
    parcels: [{ id: 'p1' }],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'list-b',
    name: 'Beta List',
    ownerId: 'user-1',
    parcels: [],
    createdAt: '2026-01-02T00:00:00.000Z',
  },
]

function renderAddMode(overrides = {}) {
  const onAddParcelsToList = vi.fn()
  render(
    <ListPanel
      currentUser={{ uid: 'user-1' }}
      isOpen
      selectedListIds={[]}
      lists={lists}
      onAddParcelsToList={onAddParcelsToList}
      selectedParcelsCount={1}
      isAddingSingleParcel
      parcelBoundaryColor="#2563eb"
      {...overrides}
    />,
  )
  return { onAddParcelsToList }
}

describe('ListPanel two-click add confirm', () => {
  afterEach(() => {
    cleanup()
  })

  function listRows() {
    return screen.getAllByRole('button').filter((el) => el.hasAttribute('data-list-confirm-row'))
  }

  it('selects on first click and adds only on second click', () => {
    const { onAddParcelsToList } = renderAddMode()

    const row = listRows()[0]
    expect(screen.getByText('Select a list to add this parcel to')).toBeTruthy()

    fireEvent.click(row)
    expect(onAddParcelsToList).not.toHaveBeenCalled()
    expect(screen.getByText('Click again to confirm')).toBeTruthy()
    expect(row.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Confirm add to list')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Confirm add to list'))
    // Newest-first sort places Beta (list-b) above Alpha (list-a)
    expect(onAddParcelsToList).toHaveBeenCalledExactlyOnceWith('list-b')
  })

  it('switches pending selection when another list is clicked', () => {
    const { onAddParcelsToList } = renderAddMode()

    const rows = listRows()
    fireEvent.click(rows[0])
    expect(rows[0].getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(rows[1])
    expect(onAddParcelsToList).not.toHaveBeenCalled()
    expect(rows[1].getAttribute('aria-pressed')).toBe('true')
    expect(rows[0].getAttribute('aria-pressed')).toBe('false')
  })

  it('clears pending selection on click outside', () => {
    renderAddMode()

    fireEvent.click(listRows()[0])
    expect(screen.getByText('Click again to confirm')).toBeTruthy()

    fireEvent.pointerDown(document.body)
    expect(screen.getByText('Select a list to add this parcel to')).toBeTruthy()
    expect(screen.queryByLabelText('Confirm add to list')).toBeNull()
  })

  it('uses two-click confirm for multi-select add via Plus/Check', () => {
    const { onAddParcelsToList } = renderAddMode({
      isAddingSingleParcel: false,
      selectedParcelsCount: 3,
    })

    expect(screen.getByText('3 parcels selected')).toBeTruthy()
    const selectBtn = screen.getAllByLabelText('Select list to add parcels')[0]
    fireEvent.click(selectBtn)
    expect(onAddParcelsToList).not.toHaveBeenCalled()
    expect(screen.getByText('Click again to confirm')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Confirm add to list'))
    expect(onAddParcelsToList).toHaveBeenCalledExactlyOnceWith('list-b')
  })
})
