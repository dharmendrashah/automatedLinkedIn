import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import {
   CampaignStarterService,
   PeopleLabelService,
   PrismaService,
   UserService,
   WalletService,
   WorkflowService,
   readGraph,
} from 'database'

import { type Graph, LABEL_MAX, type OutreachAnswers } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The data service is a fake: no money is spent. The campaign is made by the Starter, as the owner makes it.

const email = `${randomUUID()}@elitale.com`
const profile = (slug: string) => `https://www.linkedin.com/in/${slug}`
const POST = 'https://www.linkedin.com/posts/someone_topic-activity-7452924970042826760-AbCd'

const answers: OutreachAnswers = {
   name: 'Discover run',
   phrases: ['onboarding too slow'],
   customer: {
      includeTitles: ['founder'],
      seniorities: [],
      locations: [],
   },
   message: 'Hi {first_name}, thanks for connecting.',
   note: '',
   warmUp: {
      reactions: false,
      comments: 'off',
      texts: [],
   },
}

// Two people who commented with the phrase, and one who reacted; each has a Founder profile, so each scores in the maybe band.
const POSTS = [
   {
      postUrl: POST,
      postAuthorUrl: profile('author'),
   },
]
const COMMENTS = [
   {
      commenterUrl: profile('ada'),
      commenterName: 'Ada',
      commenterType: 'profile',
      comment: 'Our onboarding too slow for new hires',
   },
   {
      commenterUrl: profile('bob'),
      commenterName: 'Bob',
      commenterType: 'profile',
      comment: 'Same here, onboarding too slow',
   },
]
const REACTIONS = [
   {
      reactorUrl: profile('ada'),
      reactorName: 'Ada',
   },
]
const PROFILES = [
   {
      profileUrl: profile('ada'),
      firstName: 'Ada',
      lastName: 'Lovelace',
      headline: 'Founder',
   },
   {
      profileUrl: profile('bob'),
      firstName: 'Bob',
      lastName: 'Stone',
      headline: 'Founder',
   },
]

type Rows = Record<string, Record<string, unknown>[]>

// The data service of a run; with `waitForProfiles` the first profile read is still running when it is first looked at.
const deps = (rows: Rows, waitForProfiles = false) => {
   let profileChecks = 0
   const client = fakeDataClient((slug: string) => {
      if (slug === 'profiles') {
         profileChecks += 1

         if (waitForProfiles && profileChecks === 1) {
            return null
         }
      }

      return {
         rows: rows[slug] ?? [],
         costMicros: (rows[slug] ?? []).length * 4_000,
      }
   })

   return {
      client,
      deps: {
         client,
         signal: new AbortController().signal,
         log: {
            info: () => undefined,
            error: () => undefined,
         },
      },
   }
}

const FULL = {
   posts: POSTS,
   'post-comments': COMMENTS,
   'post-reactions': REACTIONS,
   profiles: PROFILES,
}

// Each person commented with the phrase and has a Founder profile, so each is kept as a maybe.
const crowd = (slugs: string[]): Rows => ({
   posts: POSTS,
   'post-comments': slugs.map(slug => ({
      commenterUrl: profile(slug),
      commenterName: slug,
      commenterType: 'profile',
      comment: 'onboarding too slow here',
   })),
   'post-reactions': [],
   profiles: slugs.map(slug => ({
      profileUrl: profile(slug),
      firstName: slug,
      lastName: 'Test',
      headline: 'Founder',
   })),
})

const withProfileLimit = (graph: Graph, readLimit: number): Graph => ({
   ...graph,
   nodes: graph.nodes.map(node =>
      node.id === 'profile'
         ? {
              ...node,
              config: {
                 ...node.config,
                 readLimit,
              },
           }
         : node
   ),
})

let userId: string

// Makes a campaign with the Starter, optionally sets Discover's read limit, switches Discover and Invite on, and runs Discover to its end.
const campaignRun = async (
   name: string,
   rows: Rows,
   trigger: 'MANUAL' | 'PREVIEW',
   options: { profileLimit?: number; waitForProfiles?: boolean } = {}
) => {
   const made = await CampaignStarterService.createOutreach(userId, {
      ...answers,
      name,
   })
   const [discover, invite] = made.workflows
   const discoverId = discover?.id ?? ''

   if (options.profileLimit !== undefined) {
      const stored = await PrismaService.client.workflow.findUniqueOrThrow({
         where: { id: discoverId },
         select: { graph: true },
      })

      const graph = withProfileLimit(readGraph(stored.graph), options.profileLimit)

      await WorkflowService.update(userId, discoverId, { graph })
   }

   for (const id of [discoverId, invite?.id ?? '']) {
      await WorkflowService.update(userId, id, { enabled: true })
   }

   const run = await WorkflowService.startRun(userId, discoverId, trigger, `discover-${randomUUID()}`)
   const { client, deps: engineDeps } = deps(rows, options.waitForProfiles === true)

   for (let round = 0; round < 40; round += 1) {
      const current = await PrismaService.client.workflowRun.findUniqueOrThrow({
         where: { id: run?.id ?? '' },
         select: { status: true },
      })

      if (current.status !== 'RUNNING') {
         break
      }

      await advanceRun(run?.id ?? '', engineDeps)
   }

   return {
      campaignId: made.campaignId,
      discoverId,
      inviteId: invite?.id ?? '',
      runId: run?.id ?? '',
      client,
   }
}

const labelOf = (campaignId: string) =>
   PrismaService.client.campaign
      .findUniqueOrThrow({
         where: { id: campaignId },
         select: { label: true },
      })
      .then(({ label }) => label)

describe('the Discover stage (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should label every person it lists with the campaign label, and start Invite once when it finished', async () => {
      const { campaignId, discoverId, inviteId, runId } = await campaignRun('Listed', FULL, 'MANUAL')
      const label = await labelOf(campaignId)
      const members = await PrismaService.client.workflowListMember.findMany({
         where: { addedByRunId: runId },
         select: { slug: true },
      })
      const people = await PrismaService.client.person.findMany({
         where: {
            userId,
            slug: { in: members.map(({ slug }) => slug) },
         },
         select: {
            slug: true,
            labels: true,
         },
      })

      expect(members.length).toBeGreaterThan(0)
      expect(people).toHaveLength(members.length)
      expect(people.every(({ labels }) => labels.includes(label))).toBe(true)
      expect(
         await PrismaService.client.workflowRun.count({
            where: {
               workflowId: inviteId,
               trigger: 'WORKFLOW',
            },
         })
      ).toBe(1)
      expect(discoverId).not.toBe(inviteId)
   })

   it('should start no Invite run when nobody was listed', async () => {
      const { campaignId, inviteId, runId } = await campaignRun('Empty', { posts: POSTS }, 'MANUAL')

      expect(await PrismaService.client.workflowListMember.count({ where: { addedByRunId: runId } })).toBe(0)
      expect(
         await PrismaService.client.workflowRun.count({
            where: {
               workflowId: inviteId,
               trigger: 'WORKFLOW',
            },
         })
      ).toBe(0)
      expect(campaignId).toBeTruthy()
   })

   it('should start no Invite run when the owner stopped the Discover run after it listed people', async () => {
      const original = PeopleLabelService.label
      const spy = vi.spyOn(PeopleLabelService, 'label').mockImplementation(async (...args) => {
         if (args[2].build) {
            await PrismaService.client.workflowRun.updateMany({
               where: {
                  status: 'RUNNING',
                  workflow: { name: 'Stopped \u00b7 1 Discover' },
               },
               data: { stopRequestedAt: new Date() },
            })
         }

         return original(...args)
      })

      const { inviteId, runId } = await (async () => {
         try {
            return await campaignRun('Stopped', crowd(['ivy', 'jay']), 'MANUAL')
         } finally {
            spy.mockRestore()
         }
      })()

      expect((await PrismaService.client.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe(
         'STOPPED'
      )
      expect(await PrismaService.client.workflowListMember.count({ where: { addedByRunId: runId } })).toBeGreaterThan(0)
      expect(
         await PrismaService.client.workflowRun.count({
            where: {
               workflowId: inviteId,
               trigger: 'WORKFLOW',
            },
         })
      ).toBe(0)
   })

   it('should leave no chained run and no label when the list step fails after it added people', async () => {
      const original = PeopleLabelService.label
      const spy = vi.spyOn(PeopleLabelService, 'label').mockImplementation(async (...args) => {
         if (args[2].build) {
            throw new Error('label write failed')
         }

         return original(...args)
      })

      const { campaignId, inviteId, runId } = await (async () => {
         try {
            return await campaignRun('List failed', crowd(['kim', 'lee']), 'MANUAL')
         } finally {
            spy.mockRestore()
         }
      })()
      const label = await labelOf(campaignId)
      const members = await PrismaService.client.workflowListMember.findMany({
         where: { addedByRunId: runId },
         select: { slug: true },
      })

      expect((await PrismaService.client.workflowRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe('FAILED')
      expect(members.length).toBeGreaterThan(0)
      expect(
         await PrismaService.client.person.count({
            where: {
               userId,
               slug: { in: members.map(({ slug }) => slug) },
               labels: { has: label },
            },
         })
      ).toBe(0)
      expect(
         await PrismaService.client.workflowRun.count({
            where: {
               workflowId: inviteId,
               trigger: 'WORKFLOW',
            },
         })
      ).toBe(0)
   })

   it('should not list or label a person already in one of the owner lists', async () => {
      const earlier = await PrismaService.client.workflowList.create({
         data: {
            userId,
            name: `Earlier ${randomUUID().slice(0, 8)}`,
         },
      })

      await PrismaService.client.workflowListMember.create({
         data: {
            listId: earlier.id,
            slug: 'cal',
            url: profile('cal'),
         },
      })

      const { campaignId, runId } = await campaignRun('Known', crowd(['cal', 'dan']), 'MANUAL')
      const label = await labelOf(campaignId)
      const members = await PrismaService.client.workflowListMember.findMany({
         where: { addedByRunId: runId },
         select: { slug: true },
      })

      expect(members.map(({ slug }) => slug)).toEqual(['dan'])
      expect(
         await PrismaService.client.person.count({
            where: {
               userId,
               slug: 'dan',
               labels: { has: label },
            },
         })
      ).toBe(1)
      expect(
         await PrismaService.client.person.count({
            where: {
               userId,
               slug: 'cal',
               labels: { has: label },
            },
         })
      ).toBe(0)
   })

   it('should say in the list step how many labels did not fit the cap', async () => {
      const full = Array.from({ length: LABEL_MAX }, (_, index) => `full-${index}`)

      await PrismaService.client.person.create({
         data: {
            userId,
            slug: 'eve',
            labels: full,
            lastTouchAt: new Date(),
         },
      })

      const { runId } = await campaignRun('Full labels', crowd(['eve']), 'MANUAL')
      const step = await PrismaService.client.workflowStepRun.findFirstOrThrow({
         where: {
            runId,
            nodeId: 'list',
         },
         select: { message: true },
      })
      const eve = await PrismaService.client.person.findUniqueOrThrow({
         where: {
            userId_slug: {
               userId,
               slug: 'eve',
            },
         },
         select: { labels: true },
      })

      expect(step.message).toContain('1 labels did not fit.')
      expect(eve.labels).toEqual(full)
   })

   it('should say in the profile step how many people went to Else over the read limit', async () => {
      const { runId } = await campaignRun('Read limit', crowd(['fay', 'gil']), 'MANUAL', { profileLimit: 1 })
      const step = await PrismaService.client.workflowStepRun.findFirstOrThrow({
         where: {
            runId,
            nodeId: 'profile',
         },
         select: { message: true },
      })

      expect(step.message).toContain('1 people were over the read limit of 1 and went to Else.')
      expect(await PrismaService.client.workflowListMember.count({ where: { addedByRunId: runId } })).toBe(1)
   })

   it('should read no more new people than the limit across a pass that waits for the data service', async () => {
      const { client, runId } = await campaignRun('Waiting', crowd(['hal', 'ida']), 'MANUAL', {
         profileLimit: 1,
         waitForProfiles: true,
      })
      const askedPerJob = client.start.mock.calls
         .filter(([slug]) => slug === 'profiles')
         .map(([, params]) => (Array.isArray(params.queries) ? params.queries.length : 0))

      expect(askedPerJob).toEqual([1])
      expect(await PrismaService.client.workflowListMember.count({ where: { addedByRunId: runId } })).toBe(1)
   })

   it('should write no label in a preview', async () => {
      const { campaignId } = await campaignRun('Previewed', FULL, 'PREVIEW')
      const label = await labelOf(campaignId)

      expect(
         await PrismaService.client.person.count({
            where: {
               userId,
               labels: { has: label },
            },
         })
      ).toBe(0)
   })
})
