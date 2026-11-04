import { describe, expect, it } from 'vitest'

import { ENGAGE_LIMITS, engageFileSchema, engageInputSchema, engagePostOf } from './engage'

const id = (n: number) => `0195c8a0-0000-7000-8000-00000000000${n}`
const POST = 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/'

describe('engagePostOf', () => {
   it('should name a post by the same key from either address, and leave the query off', () => {
      expect(engagePostOf(`${POST}?x=1`)).toEqual({
         link: POST,
         key: 'activity:7520195721216827392',
      })
      expect(
         engagePostOf('https://www.linkedin.com/posts/ada-lovelace_engines-activity-7520195721216827392-AbCd')
      ).toEqual({
         link: POST,
         key: 'activity:7520195721216827392',
      })
   })

   it('should refuse a share id, another host, another kind of link and a non-link', () => {
      expect(
         engagePostOf('https://www.linkedin.com/posts/ada_engines-share-7523321070687510529-AbCd/?utm_source=x')
      ).toBeNull()
      expect(engagePostOf('https://www.linkedin.com/feed/update/urn:li:share:7523321070687510529/')).toBeNull()
      expect(engagePostOf('https://evil.example/feed/update/urn:li:activity:7520195721216827392/')).toBeNull()
      expect(engagePostOf('https://www.linkedin.com/in/ada/')).toBeNull()
      expect(engagePostOf(undefined)).toBeNull()
   })
})

describe('engageInputSchema', () => {
   it('should take reactions and a comment with words, and nothing else', () => {
      expect(
         engageInputSchema.safeParse({
            acts: [
               {
                  id: id(1),
                  kind: 'react',
                  postUrl: POST,
                  reaction: 'insightful',
               },
               {
                  id: id(2),
                  kind: 'comment',
                  postUrl: POST,
                  text: 'Nice launch',
                  authorName: 'Ada',
               },
            ],
         }).success
      ).toBe(true)
   })

   it('should refuse words on a reaction, a comment with none, a bad link and a reaction nobody offers', () => {
      const bad = (act: Record<string, unknown>) =>
         engageInputSchema.safeParse({
            acts: [
               {
                  id: id(1),
                  postUrl: POST,
                  ...act,
               },
            ],
         }).success

      expect(
         bad({
            kind: 'react',
            text: 'hi',
         })
      ).toBe(false)
      expect(bad({ kind: 'comment' })).toBe(false)
      expect(
         bad({
            kind: 'react',
            postUrl: 'https://www.linkedin.com/in/ada/',
         })
      ).toBe(false)
      expect(
         bad({
            kind: 'react',
            reaction: 'curious',
         })
      ).toBe(false)
      expect(
         bad({
            kind: 'react',
            extra: true,
         })
      ).toBe(false)
   })

   it('should hold at most 10 acts and 3 comments', () => {
      const react = (n: number) => ({
         id: id(n % 10),
         kind: 'react' as const,
         postUrl: POST,
      })
      const comment = (n: number) => ({
         id: id(n % 10),
         kind: 'comment' as const,
         postUrl: POST,
         text: 'Hi',
      })

      expect(engageInputSchema.safeParse({ acts: Array.from({ length: 11 }, (_u, n) => react(n)) }).success).toBe(false)
      expect(engageInputSchema.safeParse({ acts: Array.from({ length: 4 }, (_u, n) => comment(n)) }).success).toBe(
         false
      )
      const allowed = Array.from({ length: ENGAGE_LIMITS.commentsPerRun }, (_u, n) => comment(n))

      expect(engageInputSchema.safeParse({ acts: allowed }).success).toBe(true)
   })
})

describe('engageFileSchema', () => {
   it('should read an outcome per act and refuse an outcome it does not know or a stray field', () => {
      const file = {
         contract: 1,
         captured_at: '2026-11-04T10:00:00.000Z',
         acts: [
            {
               id: id(1),
               outcome: 'REACTED',
            },
         ],
      }

      expect(engageFileSchema.safeParse(file).success).toBe(true)
      expect(
         engageFileSchema.safeParse({
            ...file,
            acts: [
               {
                  id: id(1),
                  outcome: 'LIKED',
               },
            ],
         }).success
      ).toBe(false)
      expect(
         engageFileSchema.safeParse({
            ...file,
            acts: [
               {
                  id: id(1),
                  outcome: 'REACTED',
                  text: 'x',
               },
            ],
         }).success
      ).toBe(false)
   })
})
