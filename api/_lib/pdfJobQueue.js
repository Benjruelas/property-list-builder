/**
 * Bounded in-process PDF generation queue to avoid unbounded Chromium launches.
 */

const MAX_CONCURRENT = 2
const MAX_QUEUE = 40

/** @type {Map<string, Promise<Buffer>>} */
const inFlight = new Map()
/** @type {Array<{ key: string, run: () => Promise<Buffer>, resolve: Function, reject: Function }>} */
const queue = []
let active = 0

function drain() {
  while (active < MAX_CONCURRENT && queue.length) {
    const item = queue.shift()
    active += 1
    item.run()
      .then((buf) => item.resolve(buf))
      .catch((err) => item.reject(err))
      .finally(() => {
        active -= 1
        drain()
      })
  }
}

/**
 * Deduplicate PDF generation by cache key (report id + content version).
 */
export function enqueuePdfJob(cacheKey, run) {
  const key = String(cacheKey || '').trim()
  if (!key) return run()

  if (inFlight.has(key)) return inFlight.get(key)

  const promise = new Promise((resolve, reject) => {
    if (queue.length >= MAX_QUEUE) {
      reject(new Error('PDF queue full'))
      return
    }
    queue.push({ key, run, resolve, reject })
    drain()
  }).finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, promise)
  return promise
}

export function pdfQueueStats() {
  return { active, queued: queue.length, inFlight: inFlight.size }
}
