import { describe, expect, it } from 'vitest'
import { escapeCsvValue, parseCsv, toCsv } from '../csv'

describe('parseCsv', () => {
  it('parses a simple header + rows', () => {
    const { headers, rows } = parseCsv('First Name,Last Name\nJane,Doe\nJohn,Smith')
    expect(headers).toEqual(['First Name', 'Last Name'])
    expect(rows).toEqual([
      ['Jane', 'Doe'],
      ['John', 'Smith'],
    ])
  })

  it('strips a UTF-8 BOM', () => {
    const { headers, rows } = parseCsv('\uFEFFName,Phone\nAda,555')
    expect(headers).toEqual(['Name', 'Phone'])
    expect(rows).toEqual([['Ada', '555']])
  })

  it('keeps commas inside quoted fields', () => {
    const { rows } = parseCsv('Name,Address\n"Doe, Jane","123 Main St, Fort Worth, TX"')
    expect(rows[0]).toEqual(['Doe, Jane', '123 Main St, Fort Worth, TX'])
  })

  it('unescapes doubled quotes', () => {
    const { rows } = parseCsv('Notes\n"She said ""hello"""')
    expect(rows[0][0]).toBe('She said "hello"')
  })

  it('keeps newlines inside quoted fields', () => {
    const { rows } = parseCsv('Notes\n"line 1\nline 2"')
    expect(rows[0][0]).toBe('line 1\nline 2')
  })

  it('skips blank rows', () => {
    const { rows } = parseCsv('Name\nAda\n\n\nBob\n')
    expect(rows).toEqual([['Ada'], ['Bob']])
  })

  it('pads short rows to the header length', () => {
    const { rows } = parseCsv('A,B,C\n1')
    expect(rows[0]).toEqual(['1', '', ''])
  })

  it('returns empty when the file is blank', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] })
    expect(parseCsv('\n\n')).toEqual({ headers: [], rows: [] })
  })
})

describe('escapeCsvValue / toCsv', () => {
  it('quotes values that contain commas or quotes', () => {
    expect(escapeCsvValue('a,b')).toBe('"a,b"')
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""')
  })

  it('round-trips a small table', () => {
    const csv = toCsv(['Name', 'City'], [['Ada', 'Fort Worth']])
    expect(parseCsv(csv)).toEqual({
      headers: ['Name', 'City'],
      rows: [['Ada', 'Fort Worth']],
    })
  })
})
