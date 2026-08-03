import { describe, expect, it } from 'vitest'
import {
  encryptSecret,
  decryptSecret,
  starRatingToNumber,
  normalizeReview,
  normalizeFeaturedReviewIds,
  normalizeGoogleBusinessProfile,
  toPublicGoogleBusinessProfile,
  resolveFeaturedReviews,
  signOAuthState,
  parseOAuthState,
  toReviewsParent,
  MAX_FEATURED_REVIEWS,
} from '../googleBusinessProfile.js'

describe('googleBusinessProfile helpers', () => {
  it('encrypts and decrypts refresh tokens', () => {
    const plain = '1//refresh-token-value'
    const enc = encryptSecret(plain)
    expect(enc).toMatch(/^v1:/)
    expect(enc).not.toContain(plain)
    expect(decryptSecret(enc)).toBe(plain)
  })

  it('maps Google star rating enums', () => {
    expect(starRatingToNumber('FIVE')).toBe(5)
    expect(starRatingToNumber('THREE')).toBe(3)
    expect(starRatingToNumber(4)).toBe(4)
    expect(starRatingToNumber('STAR_RATING_UNSPECIFIED')).toBe(0)
  })

  it('normalizes reviews and featured ids (max 3, cache-only)', () => {
    const reviews = [
      normalizeReview({
        name: 'accounts/1/locations/2/reviews/r1',
        starRating: 'FIVE',
        comment: 'Great',
        reviewer: { displayName: 'Pat' },
      }),
      normalizeReview({
        name: 'accounts/1/locations/2/reviews/r2',
        starRating: 'FOUR',
        comment: 'Solid',
        reviewer: { displayName: 'Sam' },
      }),
      normalizeReview({
        name: 'accounts/1/locations/2/reviews/r3',
        starRating: 'FIVE',
        comment: '',
        reviewer: { displayName: 'Lee' },
      }),
      normalizeReview({
        name: 'accounts/1/locations/2/reviews/r4',
        starRating: 'THREE',
        comment: 'Ok',
        reviewer: { displayName: 'Bo' },
      }),
    ].filter(Boolean)

    expect(reviews[0].id).toBe('r1')
    expect(reviews[0].starRating).toBe(5)

    const featured = normalizeFeaturedReviewIds(
      ['r1', 'missing', 'r2', 'r3', 'r4', 'r1'],
      reviews,
    )
    expect(featured).toEqual(['r1', 'r2', 'r3'])
    expect(featured).toHaveLength(MAX_FEATURED_REVIEWS)
  })

  it('strips refreshTokenEnc from public profile', () => {
    const profile = normalizeGoogleBusinessProfile({
      connected: true,
      accountName: 'accounts/1',
      locationName: 'accounts/1/locations/2',
      locationTitle: 'Acme',
      refreshTokenEnc: encryptSecret('secret'),
      reviewsCache: [
        {
          id: 'r1',
          name: 'accounts/1/locations/2/reviews/r1',
          reviewerName: 'Pat',
          starRating: 5,
          comment: 'Great',
        },
      ],
      featuredReviewIds: ['r1'],
      averageRating: 4.8,
      totalReviewCount: 12,
    })
    const pub = toPublicGoogleBusinessProfile(profile)
    expect(pub.refreshTokenEnc).toBeUndefined()
    expect(pub.connected).toBe(true)
    expect(pub.reviews).toHaveLength(1)
    expect(pub.featuredReviewIds).toEqual(['r1'])
  })

  it('resolves featured reviews for branding payloads', () => {
    const resolved = resolveFeaturedReviews({
      connected: true,
      accountName: 'accounts/1',
      locationName: 'accounts/1/locations/2',
      averageRating: 4.5,
      totalReviewCount: 20,
      reviewsCache: [
        { id: 'a', reviewerName: 'A', starRating: 5, comment: 'A' },
        { id: 'b', reviewerName: 'B', starRating: 4, comment: 'B' },
      ],
      featuredReviewIds: ['b', 'a'],
    })
    expect(resolved.featuredReviews.map((r) => r.id)).toEqual(['b', 'a'])
    expect(resolved.averageRating).toBe(4.5)
  })

  it('signs and parses OAuth state with expiry and scope checks', () => {
    const state = signOAuthState({ uid: 'u1', scope: 'team', teamId: 'team_1' })
    const parsed = parseOAuthState(state)
    expect(parsed.uid).toBe('u1')
    expect(parsed.scope).toBe('team')
    expect(parsed.teamId).toBe('team_1')
    expect(parseOAuthState('tampered.' + state.split('.')[1])).toBeNull()
    expect(parseOAuthState(state.slice(0, -4) + 'xxxx')).toBeNull()
  })

  it('builds reviews parent path from account + location', () => {
    expect(toReviewsParent('accounts/123', 'accounts/123/locations/456')).toBe(
      'accounts/123/locations/456',
    )
    expect(toReviewsParent('accounts/123', 'locations/456')).toBe(
      'accounts/123/locations/456',
    )
  })
})
