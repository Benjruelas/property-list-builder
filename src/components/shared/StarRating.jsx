import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Filled/empty stars for a 0–5 rating. */
export function StarRating({ rating = 0, size = 'md', className }) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0))
  const sizeClass = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5'

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n - 0.25
        const half = !filled && value >= n - 0.75
        return (
          <span key={n} className="relative inline-flex">
            <Star className={cn(sizeClass, 'text-gray-300')} strokeWidth={1.5} />
            {(filled || half) && (
              <Star
                className={cn(
                  sizeClass,
                  'absolute inset-0 text-amber-400 fill-amber-400',
                  half && 'clip-half',
                )}
                strokeWidth={1.5}
                style={half ? { clipPath: 'inset(0 50% 0 0)' } : undefined}
              />
            )}
          </span>
        )
      })}
    </span>
  )
}
