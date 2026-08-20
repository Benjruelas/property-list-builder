import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '../../..')
export const DATA_DIR = path.join(ROOT, 'parcel_data')

export function countyWorkDir(fips) {
  const dir = path.join(DATA_DIR, String(fips).padStart(5, '0'))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const body = a.slice(2)
      const eq = body.indexOf('=')
      if (eq >= 0) {
        const key = body.slice(0, eq)
        const val = body.slice(eq + 1)
        out[key] = val === '' ? true : val
        continue
      }
      const key = body
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) out[key] = true
      else {
        out[key] = next
        i++
      }
    } else {
      out._.push(a)
    }
  }
  return out
}
