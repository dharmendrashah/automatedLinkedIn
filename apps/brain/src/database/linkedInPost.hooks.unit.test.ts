import { describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInPostHooks } from './linkedInPost.hooks'
import { TaskRefusedError } from './taskErrors'

const LINK = 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/'
const session = {
   id: 's1',
   userId: 'u1',
   linkedInAccountId: 'acc1',
}

const run = async (result: Partial<TaskResult>) => {
   const publication = vi.fn().mockResolvedValue({ count: 1 })
   const account = vi.fn()

   await linkedInPostHooks.onResult?.(
      session,
      {
         message: 'Done.',
         ...result,
      } as TaskResult,
      {
         postPublication: { updateMany: publication },
         linkedInAccount: { updateMany: account },
      } as unknown as Prisma.TransactionClient
   )

   return {
      data: (publication.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data,
      where: (publication.mock.calls[0]?.[0] as { where: Record<string, unknown> } | undefined)?.where,
      account,
   }
}

const withLink = (value: string) => ({
   headline: 'The post is up.',
   sections: [
      {
         title: 'Post',
         items: [
            {
               label: 'Link',
               value,
            },
         ],
      },
   ],
})

describe('linkedin-post hooks', () => {
   it('should refuse a post for an account that is not signed in, and let one that is through', async () => {
      const findUnique = vi.fn()
      const tx = { linkedInAccount: { findUnique } } as unknown as Prisma.TransactionClient
      const request = {
         id: 's1',
         userId: 'u1',
         accountId: 'acc1',
         task: 'linkedin-post',
         trigger: 'manual' as const,
      }

      findUnique.mockResolvedValueOnce({ status: 'NEEDS_REAUTH' })

      await expect(linkedInPostHooks.onRequest?.(request, tx)).rejects.toBeInstanceOf(TaskRefusedError)

      findUnique.mockResolvedValueOnce({ status: 'ACTIVE' })

      await expect(linkedInPostHooks.onRequest?.(request, tx)).resolves.toBeUndefined()
   })

   it('should set the post as posted with its link, from the report, only for the run it belongs to', async () => {
      const { data, where } = await run({
         verdict: 'POSTED',
         report: withLink(LINK),
      })

      expect(where).toEqual({
         sessionId: 's1',
         state: { not: 'POSTED' },
      })
      expect(data).toMatchObject({
         state: 'POSTED',
         link: LINK,
         failure: null,
      })
      expect(data?.postedAt).toBeInstanceOf(Date)
   })

   it('should keep no link that is not the address of a post, and say so', async () => {
      const { data } = await run({
         verdict: 'POSTED',
         report: withLink('https://evil.example/feed/update/urn:li:activity:7520195721216827392/'),
      })

      expect(data).toMatchObject({
         state: 'POSTED',
         link: null,
      })
      expect(data?.failure).toMatch(/no link/)
   })

   it('should count a post with no link as posted, with a note', async () => {
      const { data } = await run({ verdict: 'POSTED_NO_LINK' })

      expect(data).toMatchObject({
         state: 'POSTED',
         link: null,
      })
      expect(data?.failure).toMatch(/no link/)
   })

   it('should end as failed, with the sentence, for the answers after which nothing was posted', async () => {
      for (const verdict of [
         'FAILED',
         'NO_COMPOSER',
         'WRONG_AUDIENCE',
         'WRONG_COMMENTS',
         'SIGNED_OUT',
         'ERROR',
         'NOT_ALLOWED',
         'NOT_STARTED',
      ]) {
         const { data } = await run({
            verdict,
            message: 'It did not go.',
         })

         expect(data).toMatchObject({
            state: 'FAILED',
            failure: 'It did not go.',
            link: null,
            postedAt: null,
         })
      }
   })

   it('should end as unsure for any other answer, since Post may have been pressed', async () => {
      for (const verdict of ['UNKNOWN', 'TIMED_OUT', 'CRASHED']) {
         const { data } = await run({
            verdict,
            message: 'No answer.',
         })

         expect(data).toMatchObject({
            state: 'UNKNOWN',
            failure: 'No answer.',
         })
      }
   })

   it('should ask for a sign-in check when LinkedIn said signed out, and not otherwise', async () => {
      const signedOut = await run({ verdict: 'SIGNED_OUT' })
      const posted = await run({ verdict: 'POSTED' })

      expect(signedOut.account).toHaveBeenCalledTimes(1)
      expect(posted.account).not.toHaveBeenCalled()
   })
})
