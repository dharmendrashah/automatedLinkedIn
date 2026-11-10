import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LABEL_MAX } from '@automatedLinkedIn/contracts'

import { CampaignService } from './campaign.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WorkflowService } from './workflow.service'

// Needs PostgreSQL. The backfill is the migration's own statement, read from the file, so the test runs what the migration runs.

const email = `${randomUUID()}@elitale.com`
const EMPTY = {
   nodes: [],
   edges: [],
}
const MIGRATION = path.resolve(process.cwd(), 'prisma/migrations/20261110120000_campaign_labels_backfill/migration.sql')
const REPAIR = path.resolve(process.cwd(), 'prisma/manual/campaign_labels_repair.sql')

let userId: string
let campaignRunId: string
let plainRunId: string

const person = (slug: string, labels: string[]) =>
   PrismaService.client.person.create({
      data: {
         userId,
         slug,
         labels,
         lastTouchAt: new Date(),
      },
   })

const member = (listId: string, slug: string, tags: string[], runId: string, createdAt: Date) =>
   PrismaService.client.workflowListMember.create({
      data: {
         listId,
         slug,
         url: `https://www.linkedin.com/in/${slug}`,
         tags,
         addedByRunId: runId,
         createdAt,
      },
   })

const labelsOf = async (slug: string) =>
   (
      await PrismaService.client.person.findUniqueOrThrow({
         where: {
            userId_slug: {
               userId,
               slug,
            },
         },
         select: { labels: true },
      })
   ).labels

const backfill = () => PrismaService.client.$executeRawUnsafe(readFileSync(MIGRATION, 'utf8'))

describe('the campaign labels backfill (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      const campaign = await CampaignService.create(userId, { name: 'Backfill' })
      const campaignWorkflow = await WorkflowService.create(userId, {
         name: 'Backfill \u00b7 1 Discover',
         goal: null,
         graph: EMPTY,
      })
      const plainWorkflow = await WorkflowService.create(userId, {
         name: 'Plain',
         goal: null,
         graph: EMPTY,
      })

      await CampaignService.place(userId, campaignWorkflow.id, campaign.id, 'DISCOVER')

      const campaignRun = await PrismaService.client.workflowRun.create({
         data: {
            workflowId: campaignWorkflow.id,
            userId,
            trigger: 'MANUAL',
            runKey: randomUUID(),
            status: 'SUCCEEDED',
            graph: EMPTY,
            qualifyScore: 60,
            maybeScore: 40,
            maybeEnabled: true,
         },
      })
      const plainRun = await PrismaService.client.workflowRun.create({
         data: {
            workflowId: plainWorkflow.id,
            userId,
            trigger: 'MANUAL',
            runKey: randomUUID(),
            status: 'SUCCEEDED',
            graph: EMPTY,
            qualifyScore: 60,
            maybeScore: 40,
            maybeEnabled: true,
         },
      })

      campaignRunId = campaignRun.id
      plainRunId = plainRun.id

      const list = await PrismaService.client.workflowList.create({
         data: {
            userId,
            name: `Backfill list ${randomUUID().slice(0, 8)}`,
         },
      })

      await member(list.id, 'ada', ['lead-backfill', 'gtm'], campaignRunId, new Date('2026-11-01T00:00:00Z'))
      await member(list.id, 'bob', ['lead-backfill'], campaignRunId, new Date('2026-11-02T00:00:00Z'))
      await member(list.id, 'cy', ['lead-backfill'], plainRunId, new Date('2026-11-03T00:00:00Z'))

      await person('ada', ['manual'])
      await person('bob', ['manual'])
      await person('cy', [])
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should add the tags of campaign-run members to their labels, keep the existing ones, and ignore other members', async () => {
      await backfill()

      expect(await labelsOf('ada')).toEqual(['manual', 'lead-backfill', 'gtm'])
      expect(await labelsOf('bob')).toEqual(['manual', 'lead-backfill'])
      expect(await labelsOf('cy')).toEqual([])
   })

   it('should give the same labels when it runs again', async () => {
      await backfill()

      expect(await labelsOf('ada')).toEqual(['manual', 'lead-backfill', 'gtm'])
      expect(await labelsOf('bob')).toEqual(['manual', 'lead-backfill'])
   })

   it('should keep every existing label and add only as many new tags as the cap allows', async () => {
      const manual = Array.from({ length: LABEL_MAX - 1 }, (_, index) => `manual-${index}`)
      const list = await PrismaService.client.workflowList.findFirstOrThrow({ where: { userId } })

      await person('dee', manual)
      await member(list.id, 'dee', ['a', 'b', 'c'], campaignRunId, new Date('2026-11-04T00:00:00Z'))
      await backfill()

      expect(await labelsOf('dee')).toEqual([...manual, 'a'])
   })

   it('should match the repair file to the migration, and the cap to the label limit', async () => {
      expect(readFileSync(REPAIR, 'utf8')).toBe(readFileSync(MIGRATION, 'utf8'))
      expect(readFileSync(MIGRATION, 'utf8')).toContain(`20 - COALESCE`)
      expect(LABEL_MAX).toBe(20)
   })
})
