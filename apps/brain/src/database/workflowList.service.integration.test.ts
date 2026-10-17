import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ConflictError } from './conflict'
import { IcpService } from './icp.service'
import { LinkedInProfileService } from './linkedInProfile.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WorkflowListService } from './workflowList.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

const person = (slug: string) => ({
   slug,
   url: `https://www.linkedin.com/in/${slug}`,
   name: null,
   headline: 'VP Growth',
   location: null,
   state: 'QUALIFIED' as const,
})

const page = {
   page: 1,
   pageSize: 10,
}

let userId: string
let otherUserId: string

beforeAll(async () => {
   userId = (await UserService.create({ email })).id
   otherUserId = (await UserService.create({ email: otherEmail })).id
})

afterAll(async () => {
   await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
   await PrismaService.disconnect()
})

describe('WorkflowListService (database)', () => {
   it('should add, refuse seen people, move, suppress and delete for one owner only', async () => {
      const a = await WorkflowListService.createList(userId, 'Agencies')
      const b = await WorkflowListService.createList(userId, 'Founders')

      await expect(WorkflowListService.createList(userId, 'Agencies')).rejects.toBeInstanceOf(ConflictError)
      await expect(WorkflowListService.addMember(otherUserId, a.id, person('ada'))).resolves.toBeNull()

      const ada = await WorkflowListService.addMember(userId, a.id, person('ada'))

      await expect(WorkflowListService.addMember(userId, b.id, person('ada'))).rejects.toThrow('"Agencies"')

      await LinkedInProfileService.addMany(userId, [
         {
            slug: 'grace',
            url: 'https://www.linkedin.com/in/grace',
         },
      ])
      await expect(WorkflowListService.addMember(userId, a.id, person('grace'))).rejects.toThrow('LinkedIn profiles')

      await expect(WorkflowListService.moveMember(otherUserId, ada?.id ?? '', b.id)).resolves.toBeNull()
      await expect(WorkflowListService.moveMember(userId, ada?.id ?? '', b.id)).resolves.toMatchObject({ listId: b.id })
      await expect(
         WorkflowListService.members(userId, {
            listId: b.id,
            state: 'QUALIFIED',
            search: 'growth',
            ...page,
         })
      ).resolves.toMatchObject({ total: 1 })
      await expect(
         WorkflowListService.members(otherUserId, {
            listId: b.id,
            state: 'QUALIFIED',
            ...page,
         })
      ).resolves.toMatchObject({ total: 0 })

      await WorkflowListService.updateMember(userId, ada?.id ?? '', { status: 'IN_REVIEW' })
      await expect(WorkflowListService.exportList(userId, b.id)).resolves.toMatchObject({
         name: 'Founders',
         members: [{ status: 'IN_REVIEW' }],
      })

      await expect(WorkflowListService.doNotContact(otherUserId, ada?.id ?? '')).resolves.toBeNull()
      await expect(WorkflowListService.doNotContact(userId, ada?.id ?? '')).resolves.toBe(1)
      await expect(WorkflowListService.addMember(userId, a.id, person('ada'))).rejects.toThrow('do-not-contact')

      const bob = await WorkflowListService.addMember(userId, a.id, person('bob'))

      await expect(WorkflowListService.deleteMember(otherUserId, bob?.id ?? '')).resolves.toBe(false)
      await expect(WorkflowListService.deleteList(otherUserId, a.id)).resolves.toBe(false)
      await expect(WorkflowListService.deleteList(userId, a.id)).resolves.toBe(true)
      await expect(PrismaService.client.workflowListMember.count({ where: { listId: a.id } })).resolves.toBe(0)
   })
})

describe('IcpService (database)', () => {
   it('should save, rename and delete ideal customers for one owner only', async () => {
      const rules = {
         name: 'SaaS founders',
         includeTitles: ['founder'],
         excludeTitles: [],
         seniorities: ['OWNER'],
         industries: [],
         companySizes: [],
         locations: ['london'],
         problemKeywords: [],
      }

      const icp = await IcpService.create(userId, rules)

      await expect(IcpService.create(userId, rules)).rejects.toBeInstanceOf(ConflictError)
      await expect(IcpService.getForUser(otherUserId, icp.id)).resolves.toBeNull()
      await expect(
         IcpService.update(otherUserId, icp.id, {
            ...rules,
            name: 'x',
         })
      ).resolves.toBeNull()
      await expect(
         IcpService.update(userId, icp.id, {
            ...rules,
            name: 'Founders',
         })
      ).resolves.toMatchObject({ name: 'Founders' })
      await expect(IcpService.delete(otherUserId, icp.id)).resolves.toBe(false)
      await expect(IcpService.delete(userId, icp.id)).resolves.toBe(true)
   })
})
