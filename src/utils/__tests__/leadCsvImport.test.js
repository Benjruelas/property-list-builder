import { describe, expect, it } from 'vitest'
import { parseCsv } from '../csv'
import {
  LEAD_IMPORT_FIELDS,
  LEAD_IMPORT_FIELD_GROUPS,
  MAX_IMPORT_ROWS,
  applyCreatedTagsToLeads,
  buildDuplicateIndex,
  buildLeadFromRow,
  composeAddress,
  emptyColumnMapping,
  findDuplicateReason,
  guessColumnMapping,
  nameAddressKey,
  previewImportRows,
  resolveImportStatus,
  resolveImportTagIds,
  sampleLeadCsv,
} from '../leadCsvImport'

const STATUSES = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
]

const TAGS = { leads: [{ id: 'tag_hot', name: 'Hot', color: '#f00' }] }

const CUSTOM = [{ id: 'roof_type', label: 'Roof Type', type: 'text' }]

describe('LEAD_IMPORT_FIELD_GROUPS', () => {
  it('covers every import field exactly once', () => {
    const grouped = LEAD_IMPORT_FIELD_GROUPS.flatMap((group) => group.fieldIds)
    expect(grouped.sort()).toEqual(LEAD_IMPORT_FIELDS.map((field) => field.id).sort())
  })
})

describe('composeAddress', () => {
  it('joins street + city + state + zip', () => {
    expect(composeAddress({
      street: '123 Main St',
      city: 'Fort Worth',
      state: 'TX',
      zip: '76102',
    })).toBe('123 Main St, Fort Worth, TX 76102')
  })

  it('treats a street-only Address column as the street when city/state exist', () => {
    expect(composeAddress({
      address: '123 Main St',
      city: 'Fort Worth',
      state: 'TX',
      zip: '76102',
    })).toBe('123 Main St, Fort Worth, TX 76102')
  })

  it('leaves a full address string alone', () => {
    expect(composeAddress({
      address: '123 Main St, Fort Worth, TX 76102',
    })).toBe('123 Main St, Fort Worth, TX 76102')
  })
})

describe('guessColumnMapping', () => {
  it('maps list-export headers including Owner Name', () => {
    const headers = ['Address', 'City', 'State', 'Zip', 'Owner Name', 'Mailing Address', 'Mailing City', 'Mailing State', 'Mailing Zip']
    const mapping = guessColumnMapping(headers)
    expect(mapping.street || mapping.address).toBeTruthy()
    expect(mapping.city).toBe('1')
    expect(mapping.state).toBe('2')
    expect(mapping.zip).toBe('3')
    expect(mapping.fullName).toBe('4')
  })

  it('maps first/last/phone/email and custom field labels', () => {
    const headers = ['First Name', 'Last Name', 'Phone', 'Email', 'Roof Type']
    const mapping = guessColumnMapping(headers, { customFields: CUSTOM })
    expect(mapping.firstName).toBe('0')
    expect(mapping.lastName).toBe('1')
    expect(mapping.phone).toBe('2')
    expect(mapping.email).toBe('3')
    expect(mapping.customFields.roof_type).toBe('4')
  })
})

describe('buildLeadFromRow', () => {
  it('splits Owner Name via splitOwnerName', () => {
    const mapping = emptyColumnMapping()
    mapping.fullName = '0'
    mapping.address = '1'
    const { lead, error } = buildLeadFromRow(['SMITH, JOHN A', '100 Main St'], mapping)
    expect(error).toBeNull()
    expect(lead.firstName).toBe('John')
    expect(lead.lastName).toBe('Smith')
    expect(lead.address).toBe('100 Main St')
  })

  it('composes street/city/state/zip from list-export columns', () => {
    const headers = ['Address', 'City', 'State', 'Zip', 'Owner Name']
    const mapping = guessColumnMapping(headers)
    const { lead } = buildLeadFromRow(['123 Main St', 'Fort Worth', 'TX', '76102', 'Jane Doe'], mapping)
    expect(lead.address).toBe('123 Main St, Fort Worth, TX 76102')
    expect(lead.firstName).toBeTruthy()
    expect(lead.lastName).toBeTruthy()
  })

  it('falls unknown status back to new with a warning', () => {
    const mapping = emptyColumnMapping()
    mapping.firstName = '0'
    mapping.status = '1'
    const { lead, warnings } = buildLeadFromRow(['Ada', 'not-a-status'], mapping, { leadStatuses: STATUSES })
    expect(lead.status).toBe('new')
    expect(warnings[0]).toMatch(/Unknown status/)
  })

  it('maps status labels and skips unknown tags', () => {
    const mapping = emptyColumnMapping()
    mapping.firstName = '0'
    mapping.status = '1'
    mapping.tags = '2'
    const { lead, warnings } = buildLeadFromRow(['Ada', 'Contacted', 'Hot, Storm'], mapping, {
      leadStatuses: STATUSES,
      tagRegistry: TAGS,
    })
    expect(lead.status).toBe('contacted')
    expect(lead.tagIds).toEqual(['tag_hot'])
    expect(warnings[0]).toMatch(/Storm/)
  })

  it('maps custom field values by label', () => {
    const mapping = guessColumnMapping(['First Name', 'Roof Type'], { customFields: CUSTOM })
    const { lead } = buildLeadFromRow(['Ada', 'Metal'], mapping, { customFields: CUSTOM })
    expect(lead.customFields.roof_type).toBe('Metal')
  })

  it('rejects a row with no name', () => {
    const mapping = emptyColumnMapping()
    mapping.address = '0'
    const { error } = buildLeadFromRow(['123 Main'], mapping)
    expect(error).toBe('First or last name is required')
  })
})

describe('duplicates', () => {
  it('matches email, 10-digit phone, and name+address', () => {
    const existing = [{
      firstName: 'Jane',
      lastName: 'Doe',
      address: '123 Main St',
      email: 'jane@example.com',
      phone: '(817) 555-0100',
    }]
    const index = buildDuplicateIndex(existing)
    expect(findDuplicateReason({ email: 'JANE@example.com' }, index)).toMatch(/email/)
    expect(findDuplicateReason({ phone: '8175550100' }, index)).toMatch(/phone/)
    expect(findDuplicateReason({
      firstName: 'Jane',
      lastName: 'Doe',
      address: '123 Main St',
    }, index)).toMatch(/name and address/)
    expect(nameAddressKey('Jane', 'Doe', '123 Main St'))
      .toBe(nameAddressKey(' jane ', 'doe', '123  Main St'))
  })
})

describe('previewImportRows', () => {
  it('classifies valid, invalid, and duplicate rows and rejects oversized files', () => {
    const mapping = emptyColumnMapping()
    mapping.firstName = '0'
    mapping.email = '1'
    const existing = [{ firstName: 'Dup', lastName: 'Person', email: 'dup@example.com' }]
    const preview = previewImportRows(
      [['Ada', 'ada@example.com'], ['', ''], ['Other', 'dup@example.com']],
      mapping,
      { existingLeads: existing, leadStatuses: STATUSES },
    )
    expect(preview.counts.valid).toBe(1)
    expect(preview.counts.invalid).toBe(1)
    expect(preview.counts.duplicate).toBe(1)

    const tooBig = previewImportRows(
      Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ['Ada']),
      mapping,
    )
    expect(tooBig.error).toMatch(String(MAX_IMPORT_ROWS))
  })

  it('accepts more than 200 generic rows', () => {
    const mapping = emptyColumnMapping()
    mapping.firstName = '0'
    const preview = previewImportRows(
      Array.from({ length: 250 }, (_, i) => [`Person ${i}`]),
      mapping,
    )
    expect(preview.error).toBeNull()
    expect(preview.counts.valid).toBe(250)
  })

  it('parses the sample template and treats every row as valid', () => {
    const { headers, rows } = parseCsv(sampleLeadCsv())
    const mapping = guessColumnMapping(headers)
    const preview = previewImportRows(rows, mapping, { leadStatuses: STATUSES })
    expect(preview.error).toBeNull()
    expect(preview.counts.valid).toBe(rows.length)
    expect(preview.counts.invalid).toBe(0)
  })
})

describe('resolve helpers', () => {
  it('matches status by id or label', () => {
    expect(resolveImportStatus('contacted', STATUSES).status).toBe('contacted')
    expect(resolveImportStatus('Contacted', STATUSES).status).toBe('contacted')
    expect(resolveImportStatus('', STATUSES).status).toBe('new')
  })

  it('returns unknown tag names without creating them', () => {
    expect(resolveImportTagIds('Hot, New', TAGS)).toEqual({
      tagIds: ['tag_hot'],
      unknown: ['New'],
    })
  })

  it('skips numeric Jobber tag ids and flags named unknowns for create', () => {
    expect(resolveImportTagIds('0, Client, 1', TAGS)).toEqual({
      tagIds: [],
      unknown: ['Client'],
    })
  })

  it('attaches newly created tags and strips pending names', () => {
    const leads = applyCreatedTagsToLeads(
      [{ firstName: 'Ada', tagIds: ['tag_hot'], pendingTagNames: ['Client'] }],
      { leads: [...TAGS.leads, { id: 'tag_client', name: 'Client' }] },
    )
    expect(leads[0].tagIds).toEqual(['tag_hot', 'tag_client'])
    expect(leads[0].pendingTagNames).toBeUndefined()
  })
})
