import { describe, expect, it } from 'vitest'

import {
   ENGAGE_LIMITS,
   engageFileSchema,
   engageInputSchema,
   engageKeyOf,
   engagePostOf,
   engageShareLinkOf,
} from './engage'

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

describe('repost instantly', () => {
   it('should take a repost instantly with no words, refuse words on it, and not count it among the acts with words', () => {
      const act = (fields: Record<string, unknown>) => ({
         id: id(1),
         kind: 'repost_instant',
         postUrl: POST,
         ...fields,
      })
      const accepted = (acts: unknown[]) => engageInputSchema.safeParse({ acts }).success

      expect(accepted([act({})])).toBe(true)
      expect(accepted([act({ text: 'Worth a read' })])).toBe(false)
      expect(
         accepted(
            Array.from({ length: 4 }, (_u, n) => ({
               id: id(n),
               kind: 'repost_instant',
               postUrl: POST,
            }))
         )
      ).toBe(true)
   })
})

describe('comment on a comment', () => {
   const COMMENT = '7524398140846673920'

   it('should take a reply with words on a comment of the post, and refuse one with no comment number or no words, and a comment number on any other act', () => {
      const act = (fields: Record<string, unknown>) => ({
         id: id(1),
         kind: 'comment_reply',
         postUrl: POST,
         commentId: COMMENT,
         text: 'Thanks for sharing',
         ...fields,
      })
      const accepted = (acts: unknown[]) => engageInputSchema.safeParse({ acts }).success

      expect(accepted([act({})])).toBe(true)
      expect(accepted([act({ commentId: undefined })])).toBe(false)
      expect(accepted([act({ text: undefined })])).toBe(false)
      expect(
         accepted([
            {
               id: id(1),
               kind: 'comment',
               postUrl: POST,
               text: 'Hi',
               commentId: COMMENT,
            },
         ])
      ).toBe(false)
   })

   it('should count a reply among the acts with words in a run', () => {
      const reply = (n: number) => ({
         id: id(n),
         kind: 'comment_reply',
         postUrl: POST,
         commentId: COMMENT,
         text: 'Hi',
      })

      expect(engageInputSchema.safeParse({ acts: Array.from({ length: 4 }, (_u, n) => reply(n)) }).success).toBe(false)
   })

   it('should read the replied and the comment-gone outcomes in the file', () => {
      const file = (outcome: string) =>
         engageFileSchema.safeParse({
            contract: 1,
            captured_at: '2026-11-06T10:00:00.000Z',
            acts: [
               {
                  id: id(1),
                  outcome,
               },
            ],
         }).success

      expect(file('REPLIED')).toBe(true)
      expect(file('COMMENT_GONE')).toBe(true)
   })
})

describe('engageKeyOf', () => {
   it('should key a post by its activity id, and a share address by its own number, and refuse other addresses', () => {
      expect(engageKeyOf(POST)).toEqual({
         link: POST,
         key: 'activity:7520195721216827392',
      })
      expect(
         engageKeyOf(
            'https://www.linkedin.com/posts/shahjadkhan_if-youre-looking-out-for-a-job-as-an-sdr-share-7523074151054684160-4cJx/?utm_source=share'
         )
      ).toEqual({
         link: 'https://www.linkedin.com/posts/shahjadkhan_if-youre-looking-out-for-a-job-as-an-sdr-share-7523074151054684160-4cJx/',
         key: 'share:7523074151054684160',
      })
      expect(engageKeyOf('https://www.linkedin.com/in/ada/')).toBeNull()
   })
})

describe('engageShareLinkOf', () => {
   const SHARE =
      'https://www.linkedin.com/posts/shahjadkhan_if-youre-looking-out-for-a-job-as-an-sdr-share-7523074151054684160-4cJx/?utm_source=share&utm_medium=member_desktop&rcm=ACoAAClNCsoBzc-n8600RZ_DetcLx5CiA2IybkM'
   const SHARE_CLEAN =
      'https://www.linkedin.com/posts/shahjadkhan_if-youre-looking-out-for-a-job-as-an-sdr-share-7523074151054684160-4cJx/'

   it('should name a share address by its own link, without the query, and refuse any other address', () => {
      expect(engageShareLinkOf(SHARE)).toBe(SHARE_CLEAN)
      expect(engageShareLinkOf(POST)).toBeNull()
      expect(engageShareLinkOf('https://evil.example/posts/ada_x-share-7523074151054684160-4cJx/')).toBeNull()
      expect(engageShareLinkOf(undefined)).toBeNull()
   })

   it('should take a comment on a share address, as an act of a run', () => {
      expect(
         engageInputSchema.safeParse({
            acts: [
               {
                  id: id(1),
                  kind: 'comment',
                  postUrl: SHARE,
                  text: 'Nice',
               },
            ],
         }).success
      ).toBe(true)
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

   it('should take a repost with thoughts, and refuse one without words, a reaction, or a fourth act with words', () => {
      const repost = (fields: Record<string, unknown>) =>
         engageInputSchema.safeParse({
            acts: [
               {
                  id: id(1),
                  kind: 'repost',
                  postUrl: POST,
                  ...fields,
               },
            ],
         }).success

      expect(repost({ text: 'Worth a read' })).toBe(true)
      expect(repost({})).toBe(false)
      expect(
         repost({
            text: 'Worth a read',
            reaction: 'like',
         })
      ).toBe(false)
      expect(
         engageInputSchema.safeParse({
            acts: Array.from({ length: 4 }, (_u, n) => ({
               id: id(n),
               kind: 'repost',
               postUrl: POST,
               text: 'Hi',
            })),
         }).success
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
