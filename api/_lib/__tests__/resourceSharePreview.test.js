import { describe, it, expect } from 'vitest'
import {
  buildLeadSharePreview,
  buildDealSharePreview,
  previewDescription,
  displayLeadName,
} from '../resourceSharePreview.js'

describe('resourceSharePreview', () => {
  it('uses first address/phone/email from multi-value lead fields', () => {
    const lead = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      address: 'fallback',
      addressDetails: [
        { value: '100 First St', lat: 30.1, lng: -97.7, primary: true },
        { value: '200 Second St', lat: 30.2, lng: -97.8 },
      ],
      phoneDetails: [
        { value: '5551112222', primary: true },
        { value: '5553334444' },
      ],
      emailDetails: [
        { value: 'ada@example.com', primary: true },
        { value: 'other@example.com' },
      ],
    }

    const preview = buildLeadSharePreview(lead)
    expect(displayLeadName(lead)).toBe('Ada Lovelace')
    expect(preview.address).toBe('100 First St')
    expect(preview.phone).toBe('5551112222')
    expect(preview.email).toBe('ada@example.com')
    expect(preview.lat).toBe(30.1)
    expect(preview.lng).toBe(-97.7)
  })

  it('builds deal preview from deal title + lead surface fields', () => {
    const lead = {
      firstName: 'Ben',
      lastName: 'R',
      address: '9 Oak Ave',
      lat: 1,
      lng: 2,
      phone: '5550001111',
      email: 'ben@example.com',
    }
    const deal = {
      title: 'Roof replacement',
      leadAddress: '9 Oak Ave',
      parcelId: 'p1',
    }
    const preview = buildDealSharePreview(deal, lead)
    expect(preview.resourceType).toBe('deal')
    expect(preview.title).toBe('Roof replacement')
    expect(preview.name).toBe('Ben R')
    expect(preview.address).toBe('9 Oak Ave')
    expect(previewDescription(preview)).toContain('Roof replacement')
    expect(previewDescription(preview)).toContain('9 Oak Ave')
  })
})
