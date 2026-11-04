import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { APP_URL } from 'env'

import { HandoffService } from './handoff.service'
import { PeopleService } from './people.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const db = PrismaService.client
const DAY_MS = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(Date.now() - days * DAY_MS)
const day = (date: Date) => date.toISOString().slice(0, 10)
const cellsOf = (line: string | undefined) => (line ?? '').slice(1, -1).split('","')

let userId: string
let accountId: string

const person = (slug: string, extra: Record<string, unknown> = {}) =>
   db.person.create({
      data: {
         userId,
         slug,
         lastTouchAt: new Date(),
         ...extra,
      },
   })

describe('the hand-off file and the No answer tab (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      accountId = (
         await db.linkedInAccount.create({
            data: {
               userId,
               email: `${randomUUID()}@example.com`,
               secret: 'x',
               secretIv: 'x',
               secretTag: 'x',
               status: 'ACTIVE',
            },
         })
      ).id

      await person('old', {
         name: 'Old One',
         title: 'CTO',
         company: 'Acme',
         companySlug: 'acme',
         score: 80,
         reasonText: 'Commented on a post',
         inviteState: 'PENDING',
         invitedAt: ago(30),
      })
      await person('fresh', {
         inviteState: 'PENDING',
         invitedAt: ago(5),
      })
      await person('blocked', {
         inviteState: 'PENDING',
         invitedAt: ago(40),
         doNotContact: true,
      })
      await person('answered', {
         inviteState: 'ACCEPTED',
         invitedAt: ago(50),
      })
      await db.linkedInProfile.create({
         data: {
            userId,
            slug: 'old',
            url: 'https://www.linkedin.com/in/old',
            email: 'old@acme.example',
         },
      })
      await db.linkedInCompany.create({
         data: {
            userId,
            slug: 'acme',
            url: 'https://www.linkedin.com/company/acme',
            website: 'https://www.acme.example/about',
         },
      })
      await db.linkedInReply.create({
         data: {
            userId,
            accountId,
            text: 'Hello',
            state: 'SENT',
            recipientSlug: 'old',
            recipientName: 'Old One',
            createdAt: ago(28),
         },
      })
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { id: userId } })
   })

   it('should list a pending invite of 21 days or more, longest first, and leave out a fresh one, a blocked person and an answered invite', async () => {
      const page = await PeopleService.list(userId, {
         tab: 'NO_ANSWER',
         limit: 50,
      })

      expect(page.items.map(({ slug }) => slug)).toEqual(['old'])
      expect((await PeopleService.counts(userId, {})).NO_ANSWER).toBe(1)
   })

   it('should write the hand-off line of a person from My network, the email and the company page, with no LinkedIn link', async () => {
      const { fileName, csv } = await PeopleService.export(userId, {
         tab: 'NO_ANSWER',
         columns: 'handoff',
      })
      const lines = csv.split('\r\n')

      expect(fileName).toBe('handoff.csv')
      expect(lines).toHaveLength(2)

      const cells = cellsOf(lines[1])

      expect(cells[0]).toBe(`${APP_URL}/network?open=old`)
      expect(cells.slice(1)).toEqual([
         'Old One',
         'CTO',
         'Acme',
         'acme.example',
         'old@acme.example',
         day(ago(30)),
         '',
         day(ago(28)),
         '30',
         'Commented on a post',
         '80',
      ])
      expect(csv).not.toContain('linkedin.com')
   })

   it('should still write a line, with blank cells, for a person My network does not hold', async () => {
      const csv = await HandoffService.csv(userId, [{ slug: 'stranger' }])

      expect(cellsOf(csv.split('\r\n')[1]).slice(1)).toEqual(Array(11).fill(''))
   })

   it('should say what the run knew when My network does not', async () => {
      const csv = await HandoffService.csv(userId, [
         {
            slug: 'stranger',
            name: 'Stella',
            domain: 'stella.example',
            email: 'stella@stella.example',
            score: 61,
         },
      ])

      expect(csv).toContain('"Stella","","","stella.example","stella@stella.example"')
      expect(csv).toContain('"61"')
   })
})
