import { cn } from '@/lib/utils'
import { formatStorageBytes, storageUsagePercent } from '@/utils/uploadLimits'

export function StorageUsageBar({
  usedBytes,
  limitBytes,
  className,
  label = 'Storage used',
}) {
  const used = Math.max(0, Number(usedBytes) || 0)
  const limit = Math.max(1, Number(limitBytes) || 1)
  const pct = storageUsagePercent(used, limit)
  const atLimit = used >= limit
  const nearLimit = pct >= 85 && !atLimit

  return (
    <div className={cn('storage-usage', className)}>
      <div className="storage-usage-label">
        <span>{label}</span>
        <span>
          {formatStorageBytes(used)}
          {' / '}
          {formatStorageBytes(limit)}
        </span>
      </div>
      <div
        className="storage-usage-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${pct}%`}
      >
        <div
          className={cn(
            'storage-usage-fill',
            nearLimit && 'storage-usage-fill--warn',
            atLimit && 'storage-usage-fill--full',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
