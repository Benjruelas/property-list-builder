import { describe, it, expect } from 'vitest'
import {
  canonicalFormPdfKey,
  assertCanonicalFormPdfKey,
  isWellFormedFormPdfKey,
} from '../formPdfKey.js'

describe('formPdfKey', () => {
  it('builds canonical path for owner and template', () => {
    expect(canonicalFormPdfKey('user_abc', 'tpl_123')).toBe(
      'forms/user_abc/tpl_123/original.pdf',
    )
  })

  it('rejects cross-tenant keys', () => {
    const canonical = canonicalFormPdfKey('owner_a', 'tpl_1')
    expect(assertCanonicalFormPdfKey('forms/owner_b/tpl_1/original.pdf', 'owner_a', 'tpl_1')).toBeNull()
    expect(assertCanonicalFormPdfKey(canonical, 'owner_a', 'tpl_1')).toBe(canonical)
  })

  it('rejects path traversal and malformed keys', () => {
    expect(assertCanonicalFormPdfKey('forms/../evil/tpl/original.pdf', 'owner', 'tpl')).toBeNull()
    expect(isWellFormedFormPdfKey('forms/owner/tpl/original.pdf')).toBe(true)
    expect(isWellFormedFormPdfKey('reports/owner/tpl/original.pdf')).toBe(false)
  })
})
