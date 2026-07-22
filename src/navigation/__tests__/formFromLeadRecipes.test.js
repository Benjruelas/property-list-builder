import { describe, it, expect } from 'vitest'
import {
  recipeOpenFormFillFromLeadDetail,
  recipeOpenFormEditFromLeadDetail,
} from '../recipes.js'

describe('form-from-lead recipes', () => {
  it('opens form fill from lead without forms list', () => {
    const stack = recipeOpenFormFillFromLeadDetail(
      [{ type: 'leads' }, { type: 'leads.detail', leadId: 'l1', returnToLeadsList: true }],
      'tpl1',
      { leadId: 'l1' },
    )
    expect(stack.some((f) => f.type === 'forms')).toBe(false)
    expect(stack[stack.length - 1]).toMatchObject({
      type: 'forms.fill',
      templateId: 'tpl1',
      leadId: 'l1',
      returnToLead: true,
    })
  })

  it('opens form edit from lead with returnToFormPicker', () => {
    const stack = recipeOpenFormEditFromLeadDetail(
      [{ type: 'leads.detail', leadId: 'l1', returnToLeadsList: true }],
      'tpl2',
      { leadId: 'l1', returnToFormPicker: true },
    )
    expect(stack[stack.length - 1]).toMatchObject({
      type: 'forms.edit',
      templateId: 'tpl2',
      leadId: 'l1',
      returnToLead: true,
      returnToFormPicker: true,
    })
  })
})
