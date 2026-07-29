import { describe, it, expect } from 'vitest'
import {
  parseOwnerName,
  matchResident,
  joinNameParticles,
  compareLastNames,
  isBusinessName
} from '../ownerNameMatch.js'

describe('joinNameParticles', () => {
  it('joins Mc/Mac/O/St particles to the following token', () => {
    expect(joinNameParticles(['MC', 'MILLIAN', 'THOMAS'])).toEqual(['MCMILLIAN', 'THOMAS'])
    expect(joinNameParticles(['MAC', 'DONALD', 'JOHN'])).toEqual(['MACDONALD', 'JOHN'])
    expect(joinNameParticles(['O', 'BRIEN', 'PAT'])).toEqual(['OBRIEN', 'PAT'])
    expect(joinNameParticles(['ST', 'JOHN', 'PAUL'])).toEqual(['STJOHN', 'PAUL'])
  })

  it('leaves ordinary names alone', () => {
    expect(joinNameParticles(['SMITH', 'JOHN', 'A'])).toEqual(['SMITH', 'JOHN', 'A'])
  })
})

describe('compareLastNames', () => {
  it('treats exact and compact/hyphen forms as exact', () => {
    expect(compareLastNames('SMITH', 'Smith')).toBe('exact')
    expect(compareLastNames('SMITH-JONES', 'SMITHJONES')).toBe('exact')
  })

  it('treats McMillan spelling variants as close', () => {
    expect(compareLastNames('MCMILLIAN', 'MCMILLAN')).toBe('close')
    expect(compareLastNames('MCMILLAN', 'MILLAN')).toBe('close')
  })
})

describe('parseOwnerName', () => {
  it('parses split Mc surname + given name as last/first', () => {
    const parsed = parseOwnerName('MC MILLIAN THOMAS')
    expect(parsed).toMatchObject({
      business: false,
      last: 'MCMILLIAN',
      first: 'THOMAS'
    })
  })

  it('parses comma form with split Mc surname', () => {
    const parsed = parseOwnerName('MC MILLIAN, THOMAS')
    expect(parsed).toMatchObject({
      business: false,
      last: 'MCMILLIAN',
      first: 'THOMAS'
    })
  })

  it('keeps LAST FIRST and FIRST LAST alt orderings', () => {
    const parsed = parseOwnerName('SMITH JOHN A')
    expect(parsed).toMatchObject({ last: 'SMITH', first: 'JOHN', middle: 'A' })
    expect(parsed.altFirstLast).toEqual({ first: 'SMITH', middle: 'JOHN', last: 'A' })

    const firstLast = parseOwnerName('JOHN SMITH')
    expect(firstLast).toMatchObject({ last: 'JOHN', first: 'SMITH' })
    expect(firstLast.altFirstLast).toEqual({ first: 'JOHN', middle: '', last: 'SMITH' })
  })

  it('strips joint owners and suffixes', () => {
    const parsed = parseOwnerName('SMITH JOHN & MARY')
    expect(parsed).toMatchObject({ last: 'SMITH', first: 'JOHN' })

    const withSuffix = parseOwnerName('SMITH JOHN TRUSTEE')
    expect(withSuffix).toMatchObject({ last: 'SMITH', first: 'JOHN' })
  })

  it('detects business entities', () => {
    expect(isBusinessName('ABC PROPERTIES LLC')).toBe(true)
    expect(parseOwnerName('ABC PROPERTIES LLC')).toEqual({ business: true, raw: 'ABC PROPERTIES LLC' })
  })
})

describe('matchResident', () => {
  it('matches MC MILLIAN THOMAS to Thomas Mcmillan (user case)', () => {
    const owner = parseOwnerName('MC MILLIAN THOMAS')
    const score = matchResident(owner, {
      firstname: 'Thomas',
      lastname: 'Mcmillan',
      name: 'Thomas Mcmillan'
    })
    expect(score).not.toBe('no-match')
    expect(['high', 'medium']).toContain(score)
  })

  it('matches MAC DONALD JOHN to John Macdonald', () => {
    const owner = parseOwnerName('MAC DONALD JOHN')
    expect(matchResident(owner, {
      firstname: 'John',
      lastname: 'Macdonald',
      name: 'John Macdonald'
    })).not.toBe('no-match')
  })

  it('scores common GIS orderings as high', () => {
    const resident = { firstname: 'John', lastname: 'Smith', name: 'John A Smith' }
    expect(matchResident(parseOwnerName('SMITH JOHN'), resident)).toBe('high')
    expect(matchResident(parseOwnerName('JOHN SMITH'), resident)).toBe('high')
    expect(matchResident(parseOwnerName('SMITH, JOHN A'), resident)).toBe('high')
  })

  it('returns medium for last + first initial', () => {
    expect(matchResident(parseOwnerName('SMITH J'), {
      firstname: 'John',
      lastname: 'Smith'
    })).toBe('medium')
  })

  it('does not match a different first name with a similar last', () => {
    const owner = parseOwnerName('MC MILLIAN THOMAS')
    expect(matchResident(owner, {
      firstname: 'Mary',
      lastname: 'Mcmillan',
      name: 'Mary Mcmillan'
    })).toBe('no-match')
  })

  it('returns no-match for business owners', () => {
    expect(matchResident(parseOwnerName('ABC PROPERTIES LLC'), {
      firstname: 'John',
      lastname: 'Smith'
    })).toBe('no-match')
  })
})
