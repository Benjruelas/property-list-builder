/**
 * Dev persona for local sharing tests — must stay aligned with api/lib/devBypassUsers.js
 */
const DEV_PERSONA_STORAGE_KEY = 'property_list_builder_dev_persona'

export const DEV_PERSONA_A = '1'
export const DEV_PERSONA_B = '2'

export const DEV_USER_A = {
  uid: 'dev-local',
  email: 'dev@localhost',
  displayName: 'Dev User A',
}
export const DEV_USER_B = {
  uid: 'dev-local-2',
  email: 'dev2@localhost',
  displayName: 'Dev User B',
}

const PERSONA_TO_USER = {
  [DEV_PERSONA_A]: DEV_USER_A,
  [DEV_PERSONA_B]: DEV_USER_B,
}

const PERSONA_TO_TOKEN = {
  [DEV_PERSONA_A]: 'dev-bypass',
  [DEV_PERSONA_B]: 'dev-bypass-2',
}

export function getDevPersona() {
  try {
    const v = localStorage.getItem(DEV_PERSONA_STORAGE_KEY)
    if (v === DEV_PERSONA_B) return DEV_PERSONA_B
    return DEV_PERSONA_A
  } catch {
    return DEV_PERSONA_A
  }
}

export function setDevPersona(persona) {
  const next = persona === DEV_PERSONA_B ? DEV_PERSONA_B : DEV_PERSONA_A
  try {
    localStorage.setItem(DEV_PERSONA_STORAGE_KEY, next)
  } catch { /* ignore */ }
}

export function getDevUserForPersona(persona) {
  return PERSONA_TO_USER[persona === DEV_PERSONA_B ? DEV_PERSONA_B : DEV_PERSONA_A] || DEV_USER_A
}

export function getDevTokenForPersona(persona) {
  return PERSONA_TO_TOKEN[persona === DEV_PERSONA_B ? DEV_PERSONA_B : DEV_PERSONA_A] || 'dev-bypass'
}
