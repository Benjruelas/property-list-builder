/**
 * Shared KV / Redis bootstrap for serverless routes.
 * Attaches error handlers so Redis socket failures do not crash vercel dev.
 */

let kv = null
let kvAvailable = false

function attachRedisSafety(client) {
  client.on('error', (err) => {
    console.warn('[kv] Redis error:', err?.message || err)
    kvAvailable = false
  })
}

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const kvModule = await import('@vercel/kv')
    kv = kvModule.kv
    kvAvailable = true
  } catch (e) {
    console.warn('[kv] Vercel KV init failed:', e?.message || e)
    kvAvailable = false
  }
} else if (process.env.REDIS_URL) {
  try {
    const { createClient } = await import('redis')
    kv = createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 8000,
        reconnectStrategy: (retries) => {
          if (retries > 5) return new Error('Redis reconnect limit')
          return Math.min(retries * 300, 3000)
        },
      },
    })
    attachRedisSafety(kv)
    await kv.connect()
    kvAvailable = true
  } catch (e) {
    console.warn('[kv] Redis connect failed:', e?.message || e)
    kv = null
    kvAvailable = false
  }
}

export { kv, kvAvailable }
