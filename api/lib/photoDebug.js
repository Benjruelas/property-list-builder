/** Server-side photo pipeline logs — same prefix as client for easy filtering. */

const PREFIX = '[PhotoPipeline]'

export function photoLog(step, message, data = {}) {
  console.log(`${PREFIX} api.${step} — ${message}`, {
    step: `api.${step}`,
    message,
    at: new Date().toISOString(),
    ...data,
  })
}

export function photoLogError(step, message, error, data = {}) {
  console.error(`${PREFIX} api.${step} — ${message}`, {
    step: `api.${step}`,
    message,
    error: error?.message || String(error),
    at: new Date().toISOString(),
    ...data,
  })
}
