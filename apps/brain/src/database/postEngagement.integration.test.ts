import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ConflictError } from './conflict'
import { LinkedInPostService } from './linkedInPost.service'
import { type PageReader } from './paidRead'
import { PostEngagementService } from './postEngagement.service'
import { PrismaService } from './prisma.service'
import { SpendService } from './spend.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { WorkflowListService } from './workflowList.service'

// Needs PostgreSQL. The data service is a fake: nothing is paid.

const email = `${randomUUID()}@elitale.com`
const POST_SLUG = 'activity-7452924970042826754'
const POST_URL = 'https://www.linkedin.com/feed/update/urn:li:activity:7452924970042826754'
const profile = (slug: string) => `https://www.linkedin.com/in/${slug}`

const readerOf = (rows: Record<string, unknown>[]) => ({
   collect: vi.fn<PageReader['collect']>(async () => ({
      jobId: 'job-1',
      status: 'completed' as const,
      rows,
      costMicros: rows.length * 2_000,
      error: null,
   })),
})

let userId: string
let listId: string

describe('post comments and reactions (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
      listId = (await WorkflowListService.createList(userId, `Leads ${randomUUID().slice(0, 8)}`)).id
      await WorkflowListService.addMember(userId, listId, {
         slug: 'ada',
         url: profile('ada'),
         name: 'Ada',
         headline: null,
         location: null,
         state: 'QUALIFIED',
      })
      await LinkedInPostService.addMany(userId, [
         {
            slug: POST_SLUG,
            url: POST_URL,
         },
      ])
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should read comments and reactions once a day each and show who is already in a list', async () => {
      const comments = readerOf([
         {
            commenterName: 'Ada',
            commenterUrl: profile('ada'),
            comment: 'Agreed',
         },
         {
            commenterName: 'Carol',
            commenterUrl: profile('carol'),
            comment: 'We need this',
         },
         {
            commenterName: 'Stripe',
            commenterUrl: 'https://www.linkedin.com/company/stripe',
            commenterType: 'company',
            comment: 'Thanks',
         },
      ])

      await PostEngagementService.read(userId, POST_SLUG, 'comments', false, comments)
      await expect(PostEngagementService.read(userId, POST_SLUG, 'comments', false, comments)).rejects.toBeInstanceOf(
         ConflictError
      )
      // "All" is its own read the same day.
      await PostEngagementService.read(userId, POST_SLUG, 'comments', true, comments)

      const page = await PostEngagementService.read(
         userId,
         POST_SLUG,
         'reactions',
         false,
         readerOf([
            {
               reactorName: 'Carol',
               reactorUrl: profile('carol'),
               reactionType: 'LIKE',
            },
            {
               reactorName: 'Dan',
               reactorUrl: profile('dan'),
               reactionType: 'PRAISE',
            },
         ])
      )
      const [month] = await SpendService.usage(userId)

      expect(comments.collect).toHaveBeenCalledTimes(2)
      expect(comments.collect).toHaveBeenLastCalledWith(
         'post-comments',
         {
            posts: POST_URL,
            maxResults: 1_000,
            includeReplies: true,
         },
         expect.anything()
      )
      expect(page?.comments?.items.map(({ slug, listName }) => [slug, listName])).toEqual([
         ['ada', expect.stringContaining('Leads')],
         ['carol', null],
         [null, null],
      ])
      expect(page?.reactions?.items.map(({ slug, type }) => [slug, type])).toEqual([
         ['carol', 'LIKE'],
         ['dan', 'PRAISE'],
      ])
      expect(month?.workflows).toEqual(
         expect.arrayContaining([
            {
               name: 'Comment reads',
               amountMicros: 12_000,
            },
            {
               name: 'Reaction reads',
               amountMicros: 4_000,
            },
         ])
      )
   })

   it('should add the chosen people to a list with why they were found, skipping people already there', async () => {
      await expect(PostEngagementService.addToList(userId, POST_SLUG, randomUUID(), ['dan'])).resolves.toBeNull()
      await expect(
         PostEngagementService.addToList(userId, POST_SLUG, listId, ['ada', 'carol', 'dan'])
      ).resolves.toEqual({
         added: 2,
         skipped: 1,
      })

      const carol = await WorkflowListService.memberBySlug(userId, 'carol')

      expect(carol).toMatchObject({
         state: 'UNSCORED',
         postUrl: POST_URL,
      })
      expect(carol?.signals.map(({ type, excerpt }) => [type, excerpt])).toEqual([
         ['commented', 'We need this'],
         ['reacted', null],
      ])
   })

   it('should say a read is still running, and retry one that never finished', async () => {
      const callId = `reactions-read:${userId}:${POST_SLUG}:${new Date().toISOString().slice(0, 10)}:all`
      const reader = readerOf([
         {
            reactorName: 'Erin',
            reactorUrl: profile('erin'),
         },
      ])

      await PrismaService.client.spendLedger.create({
         data: {
            userId,
            callId,
            amountMicros: 0,
            month: new Date().toISOString().slice(0, 7),
         },
      })
      await expect(PostEngagementService.read(userId, POST_SLUG, 'reactions', true, reader)).rejects.toThrow(
         'still running'
      )
      await PrismaService.client.spendLedger.update({
         where: { callId },
         data: { createdAt: new Date(Date.now() - 20 * 60 * 1000) },
      })

      const page = await PostEngagementService.read(userId, POST_SLUG, 'reactions', true, reader)

      expect(page?.reactions?.items.map(({ slug }) => slug)).toEqual(['erin'])
   })

   it('should delete the comments and reactions when the post is archived', async () => {
      const post = await LinkedInPostService.bySlug(userId, POST_SLUG)

      await LinkedInPostService.archiveForUser(userId, post?.id ?? '')

      expect(await PrismaService.client.pageSnapshot.count({ where: { userId } })).toBe(0)
      await expect(PostEngagementService.read(userId, POST_SLUG, 'reactions', true, readerOf([]))).rejects.toThrow(
         'Restore the post first.'
      )
   })
})
