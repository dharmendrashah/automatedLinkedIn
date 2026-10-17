import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { ConflictError } from './conflict'
import { LinkedInPostService } from './linkedInPost.service'
import { PostEngagementService } from './postEngagement.service'
import { PrismaService } from './prisma.service'
import { SpendService } from './spend.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { workReads } from './workReads'
import { WorkflowListService } from './workflowList.service'

// Needs PostgreSQL. The data service is a fake: nothing is paid.

const email = `${randomUUID()}@elitale.com`
const POST_SLUG = 'activity-7452924970042826754'
const POST_URL = 'https://www.linkedin.com/feed/update/urn:li:activity:7452924970042826754'
const profile = (slug: string) => `https://www.linkedin.com/in/${slug}`

const COMMENTS = [
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
]
const REACTIONS = [
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
]

const fakeService = () =>
   fakeDataClient(slug => {
      const rows = slug === 'post-comments' ? COMMENTS : REACTIONS

      return {
         rows,
         costMicros: rows.length * 2_000,
      }
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
      const service = fakeService()

      await PostEngagementService.read(userId, POST_SLUG, 'comments', false)
      await workReads(userId, service)
      await expect(PostEngagementService.read(userId, POST_SLUG, 'comments', false)).rejects.toBeInstanceOf(
         ConflictError
      )
      // "All" is its own read the same day.
      await PostEngagementService.read(userId, POST_SLUG, 'comments', true)
      await PostEngagementService.read(userId, POST_SLUG, 'reactions', false)
      await workReads(userId, service)

      const page = await PostEngagementService.detail(userId, POST_SLUG)
      const [month] = await SpendService.usage(userId)

      expect(service.start).toHaveBeenCalledWith('post-comments', {
         posts: POST_URL,
         maxResults: 1_000,
         includeReplies: true,
      })
      expect(page?.reads).toMatchObject({
         comments: { status: 'DONE' },
         reactions: { status: 'DONE' },
      })
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

   it('should drop a read whose post was archived before it started, and delete what was kept', async () => {
      const service = fakeService()
      const post = await LinkedInPostService.bySlug(userId, POST_SLUG)

      await PostEngagementService.read(userId, POST_SLUG, 'reactions', true)
      await LinkedInPostService.archiveForUser(userId, post?.id ?? '')
      await workReads(userId, service)

      expect(service.start).not.toHaveBeenCalled()
      expect((await PostEngagementService.detail(userId, POST_SLUG))?.reads.reactions?.status).toBe('FAILED')
      expect(await PrismaService.client.pageSnapshot.count({ where: { userId } })).toBe(0)
      await expect(PostEngagementService.read(userId, POST_SLUG, 'reactions', true)).rejects.toThrow(
         'Restore the post first.'
      )
   })
})
