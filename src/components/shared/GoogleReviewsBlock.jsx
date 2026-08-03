import { StarRating } from './StarRating'
import { cn } from '@/lib/utils'

function GoogleMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

/** Client-facing Google reviews block for quotes/reports. */
export function GoogleReviewsBlock({ googleReviews, className }) {
  const featured = googleReviews?.featuredReviews || []
  if (!featured.length) return null

  const averageRating = Number(googleReviews?.averageRating) || 0
  const totalReviewCount = Number(googleReviews?.totalReviewCount) || 0

  return (
    <section
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-4',
        className,
      )}
      aria-label="Google reviews"
    >
      <div className="flex items-center gap-2 mb-3">
        <GoogleMark className="h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Google reviews</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-sm font-semibold tabular-nums text-gray-900">
              {averageRating.toFixed(1)}
            </span>
            <StarRating rating={averageRating} size="sm" />
            {totalReviewCount > 0 && (
              <span className="text-xs text-gray-500">
                ({totalReviewCount} review{totalReviewCount === 1 ? '' : 's'})
              </span>
            )}
          </div>
        </div>
      </div>

      <ul className="space-y-3">
        {featured.slice(0, 3).map((review) => (
          <li key={review.id} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="text-sm font-medium text-gray-900">
                {review.reviewerName || 'Google user'}
              </span>
              <StarRating rating={review.starRating} size="sm" />
            </div>
            {review.comment ? (
              <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">
                {review.comment}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
