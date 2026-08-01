import { describe, it, expect } from 'vitest'
import { computeOwnerOccupied, __test__ } from '../ownerOccupied'

const { stripTrailingStreetSuffix, normalizeAddressCore } = __test__

describe('stripTrailingStreetSuffix', () => {
  it('strips a trailing street type', () => {
    expect(stripTrailingStreetSuffix('123 Main St')).toBe('123 Main')
    expect(stripTrailingStreetSuffix('123 Oak Circle')).toBe('123 Oak')
  })

  it('strips trailing street type plus directional', () => {
    expect(stripTrailingStreetSuffix('123 Main St N')).toBe('123 Main')
    expect(stripTrailingStreetSuffix('456 Oak Rd SW')).toBe('456 Oak')
  })

  it('strips trailing street type plus unit designator', () => {
    expect(stripTrailingStreetSuffix('123 Main St Apt 2')).toBe('123 Main')
    expect(stripTrailingStreetSuffix('123 Main Street Unit B')).toBe('123 Main')
  })
})

describe('normalizeAddressCore', () => {
  it('expands leading directionals and drops street suffixes', () => {
    expect(normalizeAddressCore('123 N Main St')).toBe(
      normalizeAddressCore('123 NORTH MAIN STREET')
    )
  })

  it('handles trailing directionals with suffix mismatch', () => {
    expect(normalizeAddressCore('123 Main St N')).toBe(
      normalizeAddressCore('123 MAIN STREET N')
    )
  })
})

describe('computeOwnerOccupied', () => {
  it('returns null for missing input', () => {
    expect(computeOwnerOccupied(null)).toBeNull()
    expect(computeOwnerOccupied({})).toBeNull()
    expect(computeOwnerOccupied({ SITUS_ADDR: '123 Main St' })).toBeNull()
  })

  it('prefers homestead Yes even with PO-box mailing', () => {
    expect(
      computeOwnerOccupied({
        HOMESTEAD_EXEMPTION: 'Y',
        SITUS_ADDR: '123 Main St',
        MAIL_ADDR: 'PO BOX 99',
      })
    ).toBe('Yes')
  })

  it('prefers homestead No even when addresses match', () => {
    expect(
      computeOwnerOccupied({
        HOMESTEAD_EXEMPTION: '0',
        SITUS_ADDR: '123 Main St',
        MAIL_ADDR: '123 Main St',
      })
    ).toBe('No')
  })

  it('matches Rd vs Road suffix mismatch', () => {
    expect(
      computeOwnerOccupied({
        SITUS_ADDR: '500 Oak Rd',
        MAIL_ADDR: '500 OAK ROAD CITY TX 75001',
      })
    ).toBe('Yes')
  })

  it('matches Cir vs Circle suffix mismatch', () => {
    expect(
      computeOwnerOccupied({
        SITUS_ADDR: '12 Pine Cir',
        MAIL_ADDR: '12 PINE CIRCLE',
      })
    ).toBe('Yes')
  })

  it('matches trailing directional with suffix mismatch', () => {
    expect(
      computeOwnerOccupied({
        SITUS_ADDR: '123 Main St N',
        MAIL_ADDR: '123 MAIN STREET N CITY TX',
      })
    ).toBe('Yes')
  })

  it('matches leading directional expansion N vs North', () => {
    expect(
      computeOwnerOccupied({
        SITUS_ADDR: '123 N Main St',
        MAIL_ADDR: '123 NORTH MAIN STREET',
      })
    ).toBe('Yes')
  })

  it('matches unit designators with suffix mismatch', () => {
    expect(
      computeOwnerOccupied({
        SITUS_ADDR: '123 Main St Apt 2',
        MAIL_ADDR: '123 MAIN STREET APT 2',
      })
    ).toBe('Yes')
  })

  it('matches when mailing prepends owner name and city/zip', () => {
    expect(
      computeOwnerOccupied({
        SITUS_ADDR: '88 Elm Ln',
        MAIL_ADDR: 'JANE DOE 88 ELM LANE AUSTIN TX 78701',
      })
    ).toBe('Yes')
  })

  it('returns No when mailing street differs', () => {
    expect(
      computeOwnerOccupied({
        SITUS_ADDR: '123 Main St',
        MAIL_ADDR: '456 Oak Ave City TX',
      })
    ).toBe('No')
  })

  it('returns No for PO-box mail without homestead', () => {
    expect(
      computeOwnerOccupied({
        SITUS_ADDR: '123 Main St',
        MAIL_ADDR: 'PO BOX 123',
      })
    ).toBe('No')
  })
})
