import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { WorkflowItemData } from 'core'

import { LinkedInCompanyService } from './linkedInCompany.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WorkflowOutputLinkService } from './workflowOutputLink.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

const profile = (slug: string): WorkflowItemData => ({
   kind: 'profile',
   slug,
   url: `https://www.linkedin.com/in/${slug}`,
   name: slug,
   headline: null,
   location: null,
   followers: null,
   title: null,
   company: null,
   signals: [],
   score: null,
   band: null,
   matched: [],
   enriched: false,
   known: false,
   tags: [],
})

const company = (slug: string): WorkflowItemData => ({
   kind: 'company',
   slug,
   url: `https://www.linkedin.com/company/${slug}`,
   name: slug,
   hiring: [],
})

const post = (slug: string): WorkflowItemData => ({
   kind: 'post',
   slug,
   url: `https://www.linkedin.com/feed/update/urn:li:activity:${slug}`,
   postId: null,
})

let userId: string
let otherUserId: string
let adaId: string

describe('WorkflowOutputLinkService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id

      adaId = (
         await PrismaService.client.person.create({
            data: {
               userId,
               slug: 'ada',
               labels: [],
               lastTouchAt: new Date(),
            },
         })
      ).id
      await PrismaService.client.person.create({
         data: {
            userId: otherUserId,
            slug: 'grace',
            labels: [],
            lastTouchAt: new Date(),
         },
      })

      await LinkedInCompanyService.addMany(userId, [
         {
            slug: 'acme',
            url: 'https://www.linkedin.com/company/acme',
         },
         {
            slug: 'globex',
            url: 'https://www.linkedin.com/company/globex',
         },
      ])
      const [globex] = (
         await LinkedInCompanyService.list(userId, {
            page: 1,
            pageSize: 10,
         })
      ).items.filter(({ slug }) => slug === 'globex')
      await LinkedInCompanyService.archiveForUser(userId, globex.id)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should give a profile its own person id, a company its in-list flag, and leave other rows unlinked', async () => {
      const rows = [
         {
            round: 0,
            item: profile('ada'),
         },
         {
            round: 0,
            item: profile('grace'),
         },
         {
            round: 0,
            item: company('acme'),
         },
         {
            round: 0,
            item: company('globex'),
         },
         {
            round: 0,
            item: post('activity-1'),
         },
      ]

      const linked = await WorkflowOutputLinkService.addLinks(userId, rows)
      const itemOf = (slug: string) => linked.find(({ item }) => item.slug === slug)?.item

      expect(itemOf('ada')).toMatchObject({ personId: adaId })
      expect(itemOf('grace')).toMatchObject({ personId: null })
      expect(itemOf('acme')).toMatchObject({ inApp: true })
      expect(itemOf('globex')).toMatchObject({ inApp: false })
      expect(itemOf('activity-1')).not.toHaveProperty('personId')
      expect(linked.map(({ round }) => round)).toEqual([0, 0, 0, 0, 0])
   })
})
