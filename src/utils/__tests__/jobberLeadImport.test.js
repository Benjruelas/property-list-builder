import { describe, expect, it } from 'vitest'
import { parseCsv } from '../csv'
import {
  applyJobberColumnPreset,
  guessColumnMapping,
  previewImportRows,
} from '../leadCsvImport'
import {
  isJobberClientCsv,
  looksLikeStreetLine,
  normalizeJobberState,
  splitContactDisplayName,
  stripJobberStreetSuffix,
} from '../jobberLeadImport'

const JOBBER_HEADERS = [
  'J-ID',
  'Display Name',
  'Company Name',
  'First Name',
  'Last Name',
  'Main Phone #s',
  'E-mails',
  'Tags',
  'CFT[Insurance Company:]',
  'Mobile Phone #s',
  'Work Phone #s',
  'Service Property Name',
  'Service Street 1',
  'Service Street 2',
  'Service City',
  'Service State',
  'Service Zip code',
  'Archived',
  'PFI[Date of Loss at Location]',
]

const CUSTOM = [
  { id: 'ins_co', label: 'Insurance Company', type: 'text' },
  { id: 'dol', label: 'Date of Loss at Location', type: 'text' },
]

function jobberRow({
  jid = '87557342_98290987',
  display = 'Kevin Weaver',
  company = '',
  first = 'Kevin',
  last = 'Weaver',
  mainPhone = '8175550100',
  emails = 'kevin@example.com',
  tags = '0, Client',
  insurance = 'State Farm',
  mobile = '2145550199',
  work = '',
  propertyName = '',
  street1 = '123 Main St • Fort Worth, Texas 76102',
  street2 = '(RENTAL PROPERTY)',
  city = 'Fort Worth',
  state = 'Texas',
  zip = '76102',
  archived = 'false',
  dateOfLoss = '2024-06-01',
} = {}) {
  return [
    jid, display, company, first, last, mainPhone, emails, tags, insurance,
    mobile, work, propertyName, street1, street2, city, state, zip, archived, dateOfLoss,
  ]
}

describe('Jobber detection and preset', () => {
  it('detects Jobber client headers', () => {
    expect(isJobberClientCsv(JOBBER_HEADERS)).toBe(true)
    expect(isJobberClientCsv(['First Name', 'Last Name', 'Phone'])).toBe(false)
  })

  it('maps Jobber service/contact columns and unwraps CFT/PFI labels', () => {
    const mapping = guessColumnMapping(JOBBER_HEADERS, { customFields: CUSTOM })
    expect(mapping.source).toBe('jobber')
    expect(mapping.firstName).toBe(String(JOBBER_HEADERS.indexOf('First Name')))
    expect(mapping.lastName).toBe(String(JOBBER_HEADERS.indexOf('Last Name')))
    expect(mapping.fullName).toBe(String(JOBBER_HEADERS.indexOf('Display Name')))
    expect(mapping.companyName).toBe(String(JOBBER_HEADERS.indexOf('Company Name')))
    expect(mapping.street).toBe(String(JOBBER_HEADERS.indexOf('Service Street 1')))
    expect(mapping.city).toBe(String(JOBBER_HEADERS.indexOf('Service City')))
    expect(mapping.state).toBe(String(JOBBER_HEADERS.indexOf('Service State')))
    expect(mapping.zip).toBe(String(JOBBER_HEADERS.indexOf('Service Zip code')))
    expect(mapping.phone).toBe(String(JOBBER_HEADERS.indexOf('Main Phone #s')))
    expect(mapping.phoneColumns).toContain(String(JOBBER_HEADERS.indexOf('Mobile Phone #s')))
    expect(mapping.phoneColumns).toContain(String(JOBBER_HEADERS.indexOf('Work Phone #s')))
    expect(mapping.email).toBe(String(JOBBER_HEADERS.indexOf('E-mails')))
    expect(mapping.customFields.ins_co).toBe(String(JOBBER_HEADERS.indexOf('CFT[Insurance Company:]')))
    expect(mapping.customFields.dol).toBe(String(JOBBER_HEADERS.indexOf('PFI[Date of Loss at Location]')))
  })

  it('lets a manual custom-field remap win over CFT auto-guess', () => {
    const mapping = applyJobberColumnPreset(JOBBER_HEADERS, { customFields: CUSTOM })
    mapping.customFields.ins_co = String(JOBBER_HEADERS.indexOf('Tags'))
    const preview = previewImportRows([jobberRow({ tags: 'Manual' })], mapping, { customFields: CUSTOM })
    expect(preview.records[0].lead.customFields.ins_co).toBe('Manual')
  })
})

describe('Jobber address cleanup', () => {
  it('strips the bullet city/state/zip suffix and normalizes Texas', () => {
    expect(stripJobberStreetSuffix('123 Main St • Fort Worth, Texas 76102')).toBe('123 Main St')
    expect(normalizeJobberState('Texas')).toBe('TX')
    expect(normalizeJobberState('tx')).toBe('TX')
    expect(looksLikeStreetLine('4533 Rugby Lane')).toBe(true)
    expect(looksLikeStreetLine('(RENTAL PROPERTY)')).toBe(false)
    expect(looksLikeStreetLine('Clients home')).toBe(false)
  })

  it('builds a cleaned TX address and parks Street 2 on notes', () => {
    const mapping = guessColumnMapping(JOBBER_HEADERS, { customFields: CUSTOM })
    const preview = previewImportRows([jobberRow()], mapping, { customFields: CUSTOM })
    const lead = preview.records[0].lead
    expect(lead.address).toBe('123 Main St, Fort Worth, TX 76102')
    expect(lead.notes).toBe('(RENTAL PROPERTY)')
  })
})

describe('Jobber grouping and fallbacks', () => {
  it('collapses three property rows for one client into one lead', () => {
    const mapping = guessColumnMapping(JOBBER_HEADERS, { customFields: CUSTOM })
    const rows = [
      jobberRow({
        jid: '99_1',
        street1: '100 Main St',
        street2: '',
        city: 'Fort Worth',
        state: 'TX',
        zip: '76102',
        mainPhone: '8175550100',
        mobile: '',
        emails: 'kevin@example.com',
      }),
      jobberRow({
        jid: '99_2',
        street1: '200 Oak Ave',
        street2: '',
        city: 'Arlington',
        state: 'TX',
        zip: '76010',
        mainPhone: '8175550100',
        mobile: '2145550199',
        emails: 'kevin@example.com, office@example.com',
      }),
      jobberRow({
        jid: '99_3',
        street1: '300 Pine Rd',
        street2: '',
        city: 'Dallas',
        state: 'Texas',
        zip: '75201',
        mainPhone: '',
        mobile: '',
        emails: '',
      }),
    ]
    const preview = previewImportRows(rows, mapping, { customFields: CUSTOM })
    expect(preview.counts.sourceRows).toBe(3)
    expect(preview.counts.total).toBe(1)
    expect(preview.counts.valid).toBe(1)
    const lead = preview.records[0].lead
    expect(lead.addressDetails).toHaveLength(3)
    expect(lead.addressDetails.map((d) => d.value)).toEqual([
      '100 Main St, Fort Worth, TX 76102',
      '200 Oak Ave, Arlington, TX 76010',
      '300 Pine Rd, Dallas, TX 75201',
    ])
    expect(lead.phones).toEqual(['8175550100', '2145550199'])
    expect(lead.emails).toEqual(['kevin@example.com', 'office@example.com'])
    expect(preview.tagsToCreate).toEqual(['Client'])
  })

  it('uses Display Name then Company Name when first/last are blank', () => {
    const mapping = guessColumnMapping(JOBBER_HEADERS, { customFields: CUSTOM })
    const displayPreview = previewImportRows([
      jobberRow({ first: '', last: '', display: 'Ada Lovelace', company: 'Ignored Co' }),
    ], mapping)
    expect(displayPreview.records[0].lead.firstName).toBe('Ada')
    expect(displayPreview.records[0].lead.lastName).toBe('Lovelace')

    const companyPreview = previewImportRows([
      jobberRow({ first: '', last: '', display: '', company: 'ABC Roofing LLC' }),
    ], mapping)
    expect(companyPreview.records[0].lead.firstName).toBe('')
    expect(companyPreview.records[0].lead.lastName).toBe('ABC Roofing LLC')
  })

  it('sets status lost when every property row is archived', () => {
    const mapping = guessColumnMapping(JOBBER_HEADERS, { customFields: CUSTOM })
    const preview = previewImportRows([
      jobberRow({ jid: '1_a', archived: 'true', street1: '1 A St', street2: '' }),
      jobberRow({ jid: '1_b', archived: 'true', street1: '2 B St', street2: '' }),
    ], mapping)
    expect(preview.records[0].lead.status).toBe('lost')
    expect(preview.records[0].lead.addressDetails).toHaveLength(2)
  })

  it('keeps new when any property row is still active', () => {
    const mapping = guessColumnMapping(JOBBER_HEADERS, { customFields: CUSTOM })
    const preview = previewImportRows([
      jobberRow({ jid: '2_a', archived: 'true', street1: '1 A St', street2: '' }),
      jobberRow({ jid: '2_b', archived: 'false', street1: '2 B St', street2: '' }),
    ], mapping)
    expect(preview.records[0].lead.status).toBe('new')
  })

  it('does not treat sibling Jobber property rows as duplicates of each other', () => {
    const mapping = guessColumnMapping(JOBBER_HEADERS, { customFields: CUSTOM })
    const preview = previewImportRows([
      jobberRow({ jid: '3_a', street1: '1 A St', street2: '' }),
      jobberRow({ jid: '3_b', street1: '2 B St', street2: '' }),
    ], mapping)
    expect(preview.counts.valid).toBe(1)
    expect(preview.counts.duplicate).toBe(0)
  })
})

describe('splitContactDisplayName', () => {
  it('treats Display Name as first last, not parcel LAST FIRST', () => {
    expect(splitContactDisplayName('Kevin Weaver')).toEqual({
      firstName: 'Kevin',
      lastName: 'Weaver',
    })
  })
})

describe('Jobber fixture CSV', () => {
  it('parses a small Jobber export string', () => {
    const csv = [
      JOBBER_HEADERS.join(','),
      '10_1,Jane Doe,,Jane,Doe,8175550100,jane@example.com,"0, Client",State Farm,2145550000,,,"100 Main St • Fort Worth, Texas 76102",(RENTAL PROPERTY),Fort Worth,Texas,76102,true,2024-01-01',
    ].join('\n')
    const { headers, rows } = parseCsv(csv)
    const mapping = guessColumnMapping(headers, { customFields: CUSTOM })
    const preview = previewImportRows(rows, mapping, { customFields: CUSTOM })
    expect(preview.counts.valid).toBe(1)
    expect(preview.records[0].lead.status).toBe('lost')
    expect(preview.records[0].lead.address).toBe('100 Main St, Fort Worth, TX 76102')
    expect(preview.records[0].lead.customFields.ins_co).toBe('State Farm')
  })
})
