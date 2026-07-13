#!/usr/bin/env node

import { TEST_CASES } from './regression-test-cases.mjs'

const errors = []
const ids = new Set()
const vagueVerifyPatterns = [
  /^Step completes/i,
  /^Target screen, panel, or dialog/i,
  /^Input\/selection is reflected/i,
  /^Action completes without crash/i,
  /^Loading\/progress finishes/i,
  /^Previous context closes/i,
  /^Starting state matches preconditions/i,
  /^A visible UI change/i,
  /^A visible success message or updated/i,
  /^The current UI visibly reflects/i,
]
const ambiguousActionPattern = /\bor other\b|if prompted|complete (?:the )?.*flow/i

for (const testCase of TEST_CASES) {
  if (ids.has(testCase.id)) errors.push(`${testCase.id}: duplicate test ID`)
  ids.add(testCase.id)

  if (!Array.isArray(testCase.steps) || testCase.steps.length < 1) {
    errors.push(`${testCase.id}: must have at least one structured procedure step`)
    continue
  }

  testCase.steps.forEach((testStep, index) => {
    const label = `${testCase.id} step ${index + 1}`
    if (!testStep || typeof testStep !== 'object') {
      errors.push(`${label}: must be a structured action/verify step`)
      return
    }
    if (!testStep.action?.trim()) errors.push(`${label}: action is required`)
    if (!testStep.verify?.trim()) errors.push(`${label}: verify checkpoint is required`)
    if (ambiguousActionPattern.test(testStep.action || '')) {
      errors.push(`${label}: action requires an explicit choice or UI target: ${testStep.action}`)
    }
    if (vagueVerifyPatterns.some((pattern) => pattern.test(testStep.verify || ''))) {
      errors.push(`${label}: verify checkpoint is generic: ${testStep.verify}`)
    }
  })

  const finalStep = testCase.steps.at(-1)
  if (!finalStep.verify.startsWith('Final-state checks:')) {
    errors.push(`${testCase.id}: last checkpoint must list final-state checks`)
  }
}

if (errors.length) {
  console.error(`Regression case validation failed with ${errors.length} error(s):`)
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

const stepCount = TEST_CASES.reduce((total, testCase) => total + testCase.steps.length, 0)
console.log(`Validated ${TEST_CASES.length} regression cases and ${stepCount} explicit checkpoints`)
