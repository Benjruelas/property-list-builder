import { describe, expect, it } from 'vitest'
import {
  ENTITY_STORAGE_LIMITS,
  formatStorageBytes,
  storageUsagePercent,
  sumDealFileBytes,
  sumLeadPhotoBytes,
} from '@/utils/uploadLimits'

describe('uploadLimits', () => {
  it('sums deal file sizes', () => {
    expect(sumDealFileBytes([{ size: 1000 }, { size: 2500 }])).toBe(3500)
    expect(sumDealFileBytes(null)).toBe(0)
  })

  it('sums lead photo sizes including variants', () => {
    expect(sumLeadPhotoBytes([
      { size: 1_000_000, thumbnailSize: 50_000, annotatedSize: 900_000 },
      { size: 500_000 },
    ])).toBe(2_450_000)
  })

  it('formats bytes for display', () => {
    expect(formatStorageBytes(512)).toBe('512 B')
    expect(formatStorageBytes(2048)).toBe('2.0 KB')
    expect(formatStorageBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('calculates usage percent capped at 100', () => {
    expect(storageUsagePercent(0, ENTITY_STORAGE_LIMITS.deal)).toBe(0)
    expect(storageUsagePercent(ENTITY_STORAGE_LIMITS.deal / 2, ENTITY_STORAGE_LIMITS.deal)).toBe(50)
    expect(storageUsagePercent(ENTITY_STORAGE_LIMITS.deal * 2, ENTITY_STORAGE_LIMITS.deal)).toBe(100)
  })
})
