import { describe, expect, it } from 'vitest'

import {
   MUTUAL_SHOWN,
   feedFileSchema,
   mutualFileSchema,
   notificationsFileSchema,
   shownAgoMs,
   viewersFileSchema,
} from './reads'

describe('shownAgoMs', () => {
   it('should read the times LinkedIn shows', () => {
      expect(shownAgoMs('9m')).toBe(9 * 60_000)
      expect(shownAgoMs('2h')).toBe(2 * 3_600_000)
      expect(shownAgoMs('1d')).toBe(86_400_000)
      expect(shownAgoMs('3w')).toBe(21 * 86_400_000)
      expect(shownAgoMs('1mo')).toBe(30 * 86_400_000)
      expect(shownAgoMs('2yr')).toBe(2 * 365 * 86_400_000)
      expect(shownAgoMs(' 5 min ')).toBe(5 * 60_000)
   })

   it('should say nothing for other text', () => {
      expect(shownAgoMs(null)).toBeNull()
      expect(shownAgoMs('')).toBeNull()
      expect(shownAgoMs('just now')).toBeNull()
      expect(shownAgoMs('2x')).toBeNull()
   })
})

describe('the files', () => {
   it('should accept a notification row and refuse a kind it does not know', () => {
      const row = {
         kind: 'viewed',
         name: 'Ada',
         slug: 'ada',
         time: '2h',
      }

      expect(notificationsFileSchema.safeParse({ rows: [row] }).success).toBe(true)
      expect(
         notificationsFileSchema.safeParse({
            rows: [
               {
                  ...row,
                  kind: 'sold',
               },
            ],
         }).success
      ).toBe(false)
      expect(
         notificationsFileSchema.safeParse({
            rows: [
               {
                  ...row,
                  slug: '',
               },
            ],
         }).success
      ).toBe(false)
   })

   it('should accept viewers with groups only (a free account) and refuse a negative count', () => {
      const file = {
         total: 13,
         periodDays: 90,
         groups: [
            {
               kind: 'works-at',
               company: 'Acme',
               count: 3,
            },
         ],
         people: [],
      }

      expect(viewersFileSchema.safeParse(file).success).toBe(true)
      expect(
         viewersFileSchema.safeParse({
            ...file,
            groups: [
               {
                  ...file.groups[0],
                  count: -1,
               },
            ],
         }).success
      ).toBe(false)
   })

   it('should cut nothing but refuse a post text over 500 characters and a feed post with no hash', () => {
      const post = {
         authorName: null,
         authorSlug: null,
         degree: '3rd+',
         hash: 'h1',
         text: 'x',
         time: '1d',
         kind: 'post',
      }

      expect(feedFileSchema.safeParse({ posts: [post] }).success).toBe(true)
      expect(
         feedFileSchema.safeParse({
            posts: [
               {
                  ...post,
                  text: 'x'.repeat(501),
               },
            ],
         }).success
      ).toBe(false)
      expect(
         feedFileSchema.safeParse({
            posts: [
               {
                  ...post,
                  hash: '',
               },
            ],
         }).success
      ).toBe(false)
   })

   it('should take at most 3 people and 10 mutual connections each', () => {
      const person = (mutual: number) => ({
         slug: 'ada',
         count: mutual,
         mutual: Array.from({ length: Math.min(mutual, MUTUAL_SHOWN + 1) }, () => ({
            name: 'Bob',
            slug: 'bob',
         })),
      })

      expect(mutualFileSchema.safeParse({ people: [person(10)] }).success).toBe(true)
      expect(mutualFileSchema.safeParse({ people: [person(11)] }).success).toBe(false)
      expect(mutualFileSchema.safeParse({ people: [person(1), person(1), person(1), person(1)] }).success).toBe(false)
   })
})
