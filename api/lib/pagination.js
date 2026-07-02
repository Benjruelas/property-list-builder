/**
 * Additive cursor pagination for in-memory arrays returned by list endpoints.
 *
 * Clients opt in with `?limit=N` (and `?cursor=` from a previous response);
 * without `limit` the full array is returned unchanged, so existing clients
 * keep working. Items are ordered newest-first by an immutable timestamp
 * (createdAt) with id as tiebreaker, so pages stay stable across writes.
 */

function sortValue(item) {
  return String(item?.createdAt || item?.updatedAt || '')
}

function compareNewestFirst(a, b) {
  const av = sortValue(a)
  const bv = sortValue(b)
  if (av !== bv) return bv.localeCompare(av)
  return String(a?.id || '').localeCompare(String(b?.id || ''))
}

export function encodeCursor(item) {
  return Buffer.from(`${sortValue(item)}|${item?.id || ''}`, 'utf8').toString('base64url')
}

function decodeCursor(cursor) {
  try {
    const raw = Buffer.from(String(cursor), 'base64url').toString('utf8')
    const sep = raw.lastIndexOf('|')
    if (sep === -1) return null
    return { sort: raw.slice(0, sep), id: raw.slice(sep + 1) }
  } catch {
    return null
  }
}

/**
 * @param {Array} items
 * @param {{ limit?: string|number, cursor?: string }} query
 * @param {{ maxLimit?: number }} [opts]
 * @returns {{ items: Array, nextCursor: string|null, paginated: boolean }}
 */
export function paginateArray(items, query = {}, { maxLimit = 500 } = {}) {
  const limit = parseInt(query.limit, 10)
  if (!Number.isFinite(limit) || limit <= 0) {
    return { items, nextCursor: null, paginated: false }
  }

  const capped = Math.min(limit, maxLimit)
  const sorted = [...(items || [])].sort(compareNewestFirst)

  let start = 0
  const parsed = query.cursor ? decodeCursor(query.cursor) : null
  if (parsed) {
    const idx = sorted.findIndex(
      (it) => sortValue(it) === parsed.sort && String(it?.id || '') === parsed.id
    )
    if (idx >= 0) {
      start = idx + 1
    } else {
      // Cursor item was deleted: resume at the first item strictly older.
      start = sorted.findIndex((it) => {
        const sv = sortValue(it)
        return sv < parsed.sort || (sv === parsed.sort && String(it?.id || '') > parsed.id)
      })
      if (start === -1) start = sorted.length
    }
  }

  const page = sorted.slice(start, start + capped)
  const hasMore = start + capped < sorted.length
  return {
    items: page,
    nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
    paginated: true,
  }
}

export default paginateArray
