import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ConflictError } from './conflict'
import { MessagePreviewService } from './messagePreview.service'
import { MAX_TEMPLATES, MessageTemplateService } from './messageTemplate.service'
import { MessageValuesService } from './messageValues.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. The words of a note, a message or a reply: what the database holds about a person, the preview, and the owner's templates.

const db = PrismaService.client
const emails = [`${randomUUID()}@elitale.com`, `${randomUUID()}@elitale.com`]

let userId: string
let otherId: string

const post = (name: string) => ({
   text: null,
   author: {
      name,
      url: null,
      avatar: null,
      headline: null,
      followers: null,
      isCompany: false,
   },
   reactions: null,
   comments: null,
   shares: null,
   postedAt: null,
   media: null,
   articleUrl: null,
   repostNote: null,
})

describe('messages (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: emails[0] })).id
      otherId = (await UserService.create({ email: emails[1] })).id

      await db.person.create({
         data: {
            userId,
            slug: 'ada',
            name: 'Ada Lovelace',
            headline: 'Founder',
            company: 'Analytical Engines',
            title: 'Founder',
            lastTouchAt: new Date(),
            connectedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
            profileRead: true,
         },
      })
      await db.personSnapshot.create({
         data: {
            userId,
            slug: 'ada',
            data: {
               name: 'Ada Lovelace',
               headline: 'Founder',
               location: 'London',
               about: 'I write programs for engines. Then I rest.',
               photo: null,
               followers: 10,
               connections: 500,
               openToWork: false,
               hiring: false,
               experience: [
                  {
                     title: 'Founder',
                     company: 'Analytical Engines',
                     location: null,
                     start: '2021',
                     end: null,
                     description: null,
                  },
                  {
                     title: 'Mathematician',
                     company: 'Babbage and Co',
                     location: null,
                     start: '2015',
                     end: '2020',
                     description: null,
                  },
               ],
               education: [
                  {
                     school: 'University of London',
                     degree: null,
                     field: null,
                     start: null,
                     end: null,
                  },
               ],
               skills: ['Mathematics'],
            },
         },
      })

      const list = await db.workflowList.create({
         data: {
            userId,
            name: `Commenters ${randomUUID().slice(0, 6)}`,
         },
      })

      await db.workflowListMember.create({
         data: {
            listId: list.id,
            slug: 'ada',
            url: 'https://www.linkedin.com/in/ada/',
            signals: [
               {
                  type: 'commented',
                  via: 'p1',
                  at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                  excerpt: 'Great point',
                  post: post('Charles Babbage'),
               },
            ],
         },
      })
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email: { in: emails } } })
      await PrismaService.disconnect()
   })

   it('should gather what is known about a person from My network, the profile read and the list entry, and nothing for another owner', async () => {
      const facts = await MessageValuesService.factsFor(userId, ['ada', 'nobody'])

      expect(facts.get('ada')).toMatchObject({
         name: 'Ada Lovelace',
         company: 'Analytical Engines',
         location: 'London',
         skills: ['Mathematics'],
      })
      expect(facts.get('ada')?.experience).toHaveLength(2)
      expect(facts.get('ada')?.signals?.[0]?.excerpt).toBe('Great point')
      expect(facts.get('nobody')).toMatchObject({ name: undefined })
      expect((await MessageValuesService.factsFor(otherId, ['ada'])).get('ada')?.name).toBeUndefined()
   })

   it('should show a text for a real person with the values filled, in words for the time, and say what is missing for someone we know little of', async () => {
      await db.person.create({
         data: {
            userId,
            slug: 'bob',
            name: 'Bob Smith',
            lastTouchAt: new Date(),
         },
      })

      const text =
         '{Hi|Hello} {first_name}, {commented_on} {commented_ago} {previous_company} {connected_ago} {company}'
      const ada = await MessagePreviewService.preview(userId, {
         use: 'message',
         text,
         slug: 'ada',
      })

      expect(ada).toMatchObject({
         forPerson: true,
         problems: [],
         missing: [],
         total: 2,
      })
      expect(ada.variants).toEqual([
         'Hi Ada, Charles Babbage 5 days ago Babbage and Co 3 weeks ago Analytical Engines',
         'Hello Ada, Charles Babbage 5 days ago Babbage and Co 3 weeks ago Analytical Engines',
      ])
      expect(ada.known).toEqual(expect.arrayContaining(['first_name', 'previous_company', 'commented_ago']))

      const bob = await MessagePreviewService.preview(userId, {
         use: 'message',
         text: 'Hi {first_name}, how is {company}?',
         slug: 'bob',
      })

      expect(bob.missing).toEqual(['company'])
      expect(bob.texts[0]).toBe('Hi Bob, how is?')

      const example = await MessagePreviewService.preview(userId, {
         use: 'invite',
         text: '{Hi|Hello} {first_name}',
      })

      expect(example).toMatchObject({
         forPerson: false,
         missing: [],
      })
      expect(example.texts[0]).toMatch(/^(Hi|Hello) Ada$/)
      expect(
         (
            await MessagePreviewService.preview(userId, {
               use: 'invite',
               text: '{Hi {nickname}',
            })
         ).problems.length
      ).toBeGreaterThan(0)
      expect((await MessagePreviewService.people(userId, 'ada')).map(({ slug }) => slug)).toEqual(['ada'])
   })

   it('should save the owner own template, replace one of the same name, refuse a text that does not read, and keep them apart by owner', async () => {
      const saved = await MessageTemplateService.save(userId, {
         use: 'invite',
         name: 'Warm hello',
         text: '{Hi|Hello} {first_name:there}',
      })

      await MessageTemplateService.save(userId, {
         use: 'invite',
         name: 'Warm hello',
         text: '{Hey|Hi} {first_name:there}',
      })

      expect((await MessageTemplateService.list(userId)).map(({ name, text }) => [name, text])).toEqual([
         ['Warm hello', '{Hey|Hi} {first_name:there}'],
      ])
      expect(await MessageTemplateService.list(otherId)).toEqual([])
      await expect(
         MessageTemplateService.save(userId, {
            use: 'invite',
            name: 'Broken',
            text: 'Hi {nickname}',
         })
      ).rejects.toBeInstanceOf(ConflictError)
      await expect(
         MessageTemplateService.save(userId, {
            use: 'invite',
            name: 'Too long',
            text: 'x'.repeat(201),
         })
      ).rejects.toThrow('The longest version is 201 characters, over the 200 allowed.')
      expect(await MessageTemplateService.remove(otherId, saved.id)).toBe(false)
      expect(await MessageTemplateService.remove(userId, saved.id)).toBe(true)
   })

   it('should keep at most 50 templates for an owner', async () => {
      for (let index = 0; index < MAX_TEMPLATES; index += 1) {
         await MessageTemplateService.save(otherId, {
            use: 'reply',
            name: `T${index}`,
            text: 'Thanks',
         })
      }

      await expect(
         MessageTemplateService.save(otherId, {
            use: 'reply',
            name: 'One more',
            text: 'Thanks',
         })
      ).rejects.toThrow('You can keep 50 templates')
      await expect(
         MessageTemplateService.save(otherId, {
            use: 'reply',
            name: 'T0',
            text: 'Thanks again',
         })
      ).resolves.toMatchObject({ text: 'Thanks again' })
   })
})
