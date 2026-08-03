import { describe, expect, it } from 'vitest'
import { getGoogleReviewsFromProfile } from '../profile'

describe('getGoogleReviewsFromProfile', () => {
  it('returns null when not connected or no featured', () => {
    expect(getGoogleReviewsFromProfile(null)).toBeNull()
    expect(getGoogleReviewsFromProfile({ googleBusinessProfile: { connected: false } })).toBeNull()
    expect(getGoogleReviewsFromProfile({
      googleBusinessProfile: {
        connected: true,
        reviews: [{ id: 'r1', reviewerName: 'A', starRating: 5, comment: 'Hi' }],
        featuredReviewIds: [],
      },
    })).toBeNull()
  })

  it('resolves up to 3 featured reviews from team public profile', () => {
    const result = getGoogleReviewsFromProfile({
      googleBusinessProfile: {
        connected: true,
        averageRating: 4.6,
        totalReviewCount: 10,
        reviews: [
          { id: 'r1', reviewerName: 'A', starRating: 5, comment: 'One' },
          { id: 'r2', reviewerName: 'B', starRating: 4, comment: 'Two' },
          { id: 'r3', reviewerName: 'C', starRating: 5, comment: 'Three' },
          { id: 'r4', reviewerName: 'D', starRating: 3, comment: 'Four' },
        ],
        featuredReviewIds: ['r2', 'r4', 'r1', 'r3'],
      },
    })
    expect(result.averageRating).toBe(4.6)
    expect(result.featuredReviews.map((r) => r.id)).toEqual(['r2', 'r4', 'r1'])
  })
})
