import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { inputPickOf } from '@automatedLinkedIn/contracts'

import { InputPickService } from './inputPick.service'
import { LinkedInPostService } from './linkedInPost.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WorkflowListService } from './workflowList.service'

// Needs PostgreSQL. A Posts input block takes the posts the Posts page's own query finds, and the ones read for what they say.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const url = (id: number) => `https://www.linkedin.com/feed/update/urn:li:activity:${id}`

let userId: string

const taken = async (config: Record<string, unknown>) => {
   const filter = await InputPickService.filter(userId, inputPickOf('input.posts', config), null, 'input.posts')

   return {
      slugs: (
         await LinkedInPostService.waiting(userId, 50, {
            ...filter,
            statuses: [],
         })
      )
         .map(({ slug }) => slug)
         .sort(),
      count: await InputPickService.count(userId, 'input.posts', filter),
   }
}

describe('the filters of a Posts input block (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      await LinkedInPostService.addMany(
         userId,
         [1, 2, 3, 4].map(id => ({
            slug: `activity-${id}`,
            url: url(id),
         }))
      )

      // 1: busy post by Ada; 2: quiet post by Bob; 3: never read; 4: read, but done.
      for (const [id, author, comments, reactions, text] of [
         [1, 'Ada Lovelace', 40, 300, 'We are hiring engineers'],
         [2, 'Bob Stone', 2, 5, 'A quiet note'],
         [4, 'Ada Lovelace', 90, 900, 'Hiring again'],
      ] as const) {
         await db.pageSnapshot.create({
            data: {
               userId,
               kind: 'POST',
               slug: `activity-${id}`,
               data: {
                  author: { name: author },
                  comments,
                  reactions,
                  text,
               },
            },
         })
      }

      await db.linkedInPost.updateMany({
         where: {
            userId,
            slug: 'activity-4',
         },
         data: { status: 'PROCESSED' },
      })

      const list = await WorkflowListService.createList(userId, `People ${randomUUID().slice(0, 8)}`)

      await WorkflowListService.addFromRun(userId, list.id, 'run-1', [
         {
            slug: 'ada',
            url: 'https://www.linkedin.com/in/ada',
            name: 'Ada',
            headline: null,
            location: null,
            state: 'QUALIFIED' as const,
            postUrl: url(1),
            score: 50,
            signals: [],
            title: null,
            company: null,
            followers: null,
            matched: [],
            tags: [],
            known: false,
         },
      ])
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should take every waiting post when no filter is on, never a done one', async () => {
      expect((await taken({})).slugs).toEqual(['activity-1', 'activity-2', 'activity-3'])
   })

   it('should take by words, author, read or not, comments and reactions, in the live count too', async () => {
      expect(await taken({ search: 'hiring' })).toEqual({
         slugs: ['activity-1'],
         count: 1,
      })
      expect((await taken({ filters: JSON.stringify({ author: 'stone' }) })).slugs).toEqual(['activity-2'])
      expect((await taken({ filters: JSON.stringify({ read: 'UNREAD' }) })).slugs).toEqual(['activity-3'])
      expect((await taken({ filters: JSON.stringify({ read: 'READ' }) })).slugs).toEqual(['activity-1', 'activity-2'])
      expect((await taken({ filters: JSON.stringify({ minComments: 10 }) })).slugs).toEqual(['activity-1'])
      expect((await taken({ filters: JSON.stringify({ minReactions: 1 }) })).slugs).toEqual([
         'activity-1',
         'activity-2',
      ])
      expect(
         (
            await taken({
               search: 'hiring',
               filters: JSON.stringify({
                  minComments: 1,
                  minReactions: 100,
                  author: 'ada',
               }),
            })
         ).slugs
      ).toEqual(['activity-1'])
   })

   it('should take only posts that qualified people were found from', async () => {
      expect((await taken({ filters: JSON.stringify({ hasQualified: true }) })).slugs).toEqual(['activity-1'])
   })

   it('should take nothing when the filters match nothing', async () => {
      expect((await taken({ search: 'no such words' })).count).toBe(0)
   })
})
