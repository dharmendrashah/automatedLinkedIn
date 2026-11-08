import { describe, expect, it } from 'vitest'

import { internalPathOf, postDetailOf } from './block-output-rows'

describe('internalPathOf', () => {
   it('opens a kept post on /posts', () => {
      expect(internalPathOf({ kind: 'post', slug: 'activity-1', postId: 'p1' })).toBe('/posts?post=activity-1')
   })

   it('keeps a post with no post id on LinkedIn', () => {
      expect(internalPathOf({ kind: 'post', slug: 'activity-1', postId: null })).toBeNull()
   })

   it('opens a profile with a person id on /network', () => {
      expect(internalPathOf({ kind: 'profile', slug: 'ada', personId: 'x9' })).toBe('/network?open=x9')
   })

   it('keeps a profile without a person id on LinkedIn', () => {
      expect(internalPathOf({ kind: 'profile', slug: 'ada', personId: null })).toBeNull()
   })

   it('opens a company in the owner list on /companies only', () => {
      expect(internalPathOf({ kind: 'company', slug: 'acme', inApp: true })).toBe('/companies?company=acme')
      expect(internalPathOf({ kind: 'company', slug: 'acme', inApp: false })).toBeNull()
   })

   it('keeps jobs, ads and conversations on LinkedIn', () => {
      for (const kind of ['job', 'ad', 'conversation']) {
         expect(internalPathOf({ kind, slug: '1' })).toBeNull()
      }
   })

   it('encodes a slug with a space and keeps the case of lnkd- slugs', () => {
      expect(internalPathOf({ kind: 'company', slug: 'a b', inApp: true })).toBe('/companies?company=a%20b')
      expect(internalPathOf({ kind: 'post', slug: 'lnkd-abc', postId: 'p1' })).toBe('/posts?post=lnkd-abc')
   })
})

describe('postDetailOf', () => {
   it('shows the author name from the stored post', () => {
      expect(postDetailOf({ author: { name: 'Ada' } })).toBe('Ada')
   })

   it('is empty when the post has no name or no copy', () => {
      expect(postDetailOf({ author: { name: null } })).toBe('')
      expect(postDetailOf(null)).toBe('')
   })
})
