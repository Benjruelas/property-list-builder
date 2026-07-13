/**
 * Lightweight timing logs for infra hot-spot measurement.
 * Disable with INFRA_TIMING=0.
 */

export async function withTiming(label, fn, meta = {}) {
  const start = Date.now()
  try {
    const result = await fn()
    logTiming(label, Date.now() - start, meta)
    return result
  } catch (err) {
    logTiming(label, Date.now() - start, { ...meta, error: err?.message || String(err) })
    throw err
  }
}

function logTiming(label, ms, meta = {}) {
  if (process.env.INFRA_TIMING === '0') return
  console.log(JSON.stringify({ type: 'timing', label, ms, ...meta }))
}

export default withTiming
