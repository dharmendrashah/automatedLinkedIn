import { describe, expect, it } from 'vitest'

import { reportSchema } from '@automatedLinkedIn/contracts'

import { answerFor } from './answer'
import { type PostResult } from './post'

const LINK = 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/'

const ALL: PostResult[] = [
   {
      outcome: 'POSTED',
      link: LINK,
   },
   { outcome: 'POSTED_NO_LINK' },
   { outcome: 'UNKNOWN' },
   { outcome: 'NO_COMPOSER' },
   { outcome: 'SIGNED_OUT' },
   { outcome: 'WRONG_COMMENTS' },
   {
      outcome: 'WRONG_AUDIENCE',
      found: 'Connections only',
   },
   {
      outcome: 'FAILED',
      why: 'TYPING',
   },
   {
      outcome: 'FAILED',
      why: 'POST_DISABLED',
   },
   {
      outcome: 'FAILED',
      why: 'POST_NOT_CLICKED',
   },
   {
      outcome: 'FAILED',
      why: 'NO_FILES',
   },
   {
      outcome: 'FAILED',
      why: 'ATTACH',
   },
   {
      outcome: 'FAILED',
      why: 'UPLOAD',
   },
   {
      outcome: 'FAILED',
      why: 'FILE_REFUSED',
   },
]

describe('answerFor', () => {
   it('should give the link of a post that went in a report, and keep the session', () => {
      const answer = answerFor(ALL[0] as PostResult)

      expect(answer).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'POSTED',
         commitSession: true,
      })
      expect(reportSchema.parse(answer.report).sections[0]?.items[0]).toMatchObject({
         label: 'Link',
         value: LINK,
      })
   })

   it('should count a post with no link as made, and anything that is not a post as failed', () => {
      expect(answerFor({ outcome: 'POSTED_NO_LINK' }).status).toBe('SUCCEEDED')

      for (const result of ALL.slice(2)) {
         expect(answerFor(result).status).toBe('FAILED')
      }
   })

   it('should answer in one fixed sentence the result can carry, without what the page showed', () => {
      for (const result of ALL) {
         const { message } = answerFor(result)

         expect(message.length).toBeGreaterThan(0)
         expect(message.length).toBeLessThanOrEqual(200)
         expect(message).not.toContain('Connections only')
      }
   })
})
