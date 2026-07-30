/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

let geocodeResults = []
let geocodeSearching = false
let geocodeError = null

vi.mock('@/hooks/useMapboxGeocode', () => ({
  useMapboxGeocode: () => {
    const [query, setQueryState] = useState('')
    const clear = useCallback(() => setQueryState(''), [])
    const setQuery = useCallback((v) => setQueryState(v ?? ''), [])
    return {
      query,
      setQuery,
      results: geocodeResults,
      isSearching: geocodeSearching,
      error: geocodeError,
      clear,
    }
  },
}))

vi.mock('@/utils/quotes', () => ({
  fetchQuotes: vi.fn(async () => [{ id: 'q1', leadId: 'l1', title: 'Quote A' }]),
}))

vi.mock('@/utils/photoReports', () => ({
  fetchPhotoReports: vi.fn(async () => [{ id: 'r1', leadId: 'l1', title: 'Report A' }]),
}))

vi.mock('@/utils/tasks', () => ({
  fetchTeamTasks: vi.fn(async () => ({
    tasks: [{ id: 't1', leadId: 'l1', title: 'Call back' }],
    teamId: null,
  })),
}))

import { AddressSearch } from '../AddressSearch'

const leads = [
  {
    id: 'l1',
    firstName: 'John',
    lastName: 'Smith',
    address: '123 Main St, Austin, TX',
    updatedAt: '2024-06-01',
  },
]

const pipelines = [
  {
    id: 'pipe1',
    title: 'Sales',
    deals: [{ id: 'd1', leadId: 'l1', title: 'Roof deal' }],
  },
]

async function renderSearch(handlers = {}) {
  document.body.innerHTML = '<div id="root"></div>'
  const container = document.getElementById('root')
  const root = createRoot(container)
  const props = {
    onOpenLead: vi.fn(),
    onOpenDeal: vi.fn(),
    onOpenTask: vi.fn(),
    onOpenQuote: vi.fn(),
    onOpenReport: vi.fn(),
    onLocationFound: vi.fn(),
    ...handlers,
  }
  await act(async () => {
    root.render(
      <AddressSearch
        leads={leads}
        pipelines={pipelines}
        getToken={async () => 'tok'}
        currentUser={{ uid: 'u1' }}
        mapInstanceRef={{ current: null }}
        {...props}
      />,
    )
  })
  return { root, container, props }
}

async function openSearch(container) {
  await act(async () => {
    container.querySelector('button[title="Search leads or address"]')?.click()
  })
}

async function typeQuery(container, text) {
  const input = container.querySelector('input')
  expect(input).toBeTruthy()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    // React 17+/18 often listens to the input event via onChange synthetic system;
    // also fire a change-like path by calling the React onChange through a InputEvent.
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }))
  })
}

async function flushDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(350)
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('AddressSearch dual-purpose results', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    geocodeResults = []
    geocodeSearching = false
    geocodeError = null
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('shows CRM lead rows for a name query', async () => {
    const { container } = await renderSearch()
    await openSearch(container)
    await typeQuery(container, 'John')
    await flushDebounce()

    const panel = container.querySelector('.map-search-results-panel')
    expect(panel).toBeTruthy()
    expect(panel.textContent).toContain('John Smith')
    // Name matches should not repeat "Name: …" under the lead title
    expect(panel.textContent).not.toMatch(/Name:\s*John Smith/)
  })

  it('puts top Mapbox address above CRM when address-like and CRM matches', async () => {
    geocodeResults = [
      { id: 'mb1', place_name: '123 Main St, Austin, Texas', center: [-97.7, 30.2], address: { city: 'Austin' } },
      { id: 'mb2', place_name: '123 Main Ave', center: [-97.8, 30.3], address: {} },
    ]
    const { container } = await renderSearch()
    await openSearch(container)
    await typeQuery(container, '123 Main')
    await flushDebounce()

    const panel = container.querySelector('.map-search-results-panel')
    expect(panel).toBeTruthy()
    const text = panel.textContent
    const addrIdx = text.indexOf('123 Main St, Austin, Texas')
    const leadIdx = text.indexOf('John Smith')
    expect(addrIdx).toBeGreaterThanOrEqual(0)
    expect(leadIdx).toBeGreaterThan(addrIdx)
    expect(text).not.toContain('123 Main Ave')
  })

  it('shows Mapbox-only suggestions when address-like and no CRM match', async () => {
    geocodeResults = [
      { id: 'mb1', place_name: '999 Nowhere Blvd', center: [-97, 30], address: {} },
      { id: 'mb2', place_name: '999 Nowhere Road', center: [-97, 30], address: {} },
    ]
    const { container } = await renderSearch()
    await openSearch(container)
    await typeQuery(container, '999 Nowhere Blvd')
    await flushDebounce()

    const panel = container.querySelector('.map-search-results-panel')
    expect(panel.textContent).toContain('999 Nowhere Blvd')
    expect(panel.textContent).toContain('999 Nowhere Road')
    expect(panel.textContent).not.toContain('John Smith')
  })

  it('shows nothing for name-like query with no CRM matches', async () => {
    geocodeResults = [{ id: 'mb1', place_name: 'Should not show', center: [0, 0], address: {} }]
    const { container } = await renderSearch()
    await openSearch(container)
    await typeQuery(container, 'Zzznobody')
    await flushDebounce()

    expect(container.querySelector('.map-search-results-panel')).toBeNull()
  })

  it('invokes onOpenLead when a lead row is clicked', async () => {
    const { container, props } = await renderSearch()
    await openSearch(container)
    await typeQuery(container, 'John')
    await flushDebounce()

    const leadRow = [...container.querySelectorAll('[role="option"]')].find((el) =>
      el.textContent.includes('John Smith'),
    )
    expect(leadRow).toBeTruthy()
    await act(async () => {
      leadRow.click()
    })
    expect(props.onOpenLead).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }))
  })
})
