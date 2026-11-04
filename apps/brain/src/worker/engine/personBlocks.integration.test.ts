import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CryptoService } from 'core'
import { fakeDataClient } from 'core/fakeDataClient'

import { PersonStateService, PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. Nothing is asked of the spider or the data service.

const email = `${randomUUID()}@elitale.com`
const HOUR_MS = 60 * 60 * 1000
const profile = (slug: string) => `https://www.linkedin.com/in/${slug}`
const db = PrismaService.client

const node = (id: string, type: GraphNode['type'], config: GraphNode['config'] = {}): GraphNode => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const line = (from: string, to: string) => ({
   from,
   to,
})

const deps = () => ({
   client: fakeDataClient(() => ({
      rows: [],
      costMicros: 0,
   })),
   signal: new AbortController().signal,
   log: {
      info: () => undefined,
      error: () => undefined,
   },
})

let userId: string
let fresh: string
let stale: string

const account = async (reads: { connectionsReadAt: Date | null; messagesReadAt: Date | null }) => {
   const sealed = CryptoService.seal('{}')

   return (
      await db.linkedInAccount.create({
         data: {
            userId,
            email: `${randomUUID()}@example.com`,
            secret: sealed.ciphertext,
            secretIv: sealed.iv,
            secretTag: sealed.tag,
            status: 'ACTIVE',
            ...reads,
         },
      })
   ).id
}

// A person of My network with a chat of the given kind and the sides that wrote in it.
const chat = async (slug: string, sides: Array<'ME' | 'THEM'>, kind: 'DIRECT' | 'GROUP' = 'DIRECT') => {
   const person = await db.person.create({
      data: {
         userId,
         slug,
         lastTouchAt: new Date(),
      },
   })
   const conversation = await db.linkedInConversation.create({
      data: {
         userId,
         accountId: fresh,
         linkedInId: randomUUID(),
         title: slug,
         kind,
         participants: [],
         unread: false,
         complete: true,
         messageCount: sides.length,
         lastMessageAt: new Date(),
         lastDirection: sides.at(-1) ?? null,
      },
   })

   await db.personLink.create({
      data: {
         personId: person.id,
         accountId: fresh,
         kind: 'CONVERSATION',
         sourceId: conversation.id,
         at: new Date(),
      },
   })
   await db.linkedInMessage.createMany({
      data: sides.map((direction, position) => ({
         conversationId: conversation.id,
         linkedInId: randomUUID(),
         direction,
         senderName: slug,
         whenText: 'Nov 4, 2026 9:00 AM',
         text: `a private word from ${slug} ada@engines.example`,
         attachments: [],
         position,
      })),
   })
}

const run = async (graph: Graph) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Check ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const runId = (await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `check-${randomUUID()}`))?.id ?? ''

   await advanceRun(runId, deps())

   return runId
}

const itemsAt = (runId: string, nodeId: string) =>
   db.workflowItem.findMany({
      where: {
         runId,
         nodeId,
      },
      orderBy: { slug: 'asc' },
   })

const slugsAt = async (runId: string, nodeId: string) => (await itemsAt(runId, nodeId)).map(({ slug }) => slug)

const messageOf = async (runId: string, nodeId: string) =>
   (
      await db.workflowStepRun.findFirst({
         where: {
            runId,
            nodeId,
         },
      })
   )?.message

const reasonOf = (item: { data: unknown }) => (item.data as { result?: { reason?: string } }).result?.reason

const PEOPLE = ['conn', 'talk', 'wrote', 'group', 'free']

const checkGraph = (config: GraphNode['config'], slugs = PEOPLE): Graph => ({
   nodes: [
      node('people', 'input.profiles', { links: slugs.map(profile) }),
      node('check', 'logic.ifPerson', config),
      node('else', 'logic.else'),
   ],
   edges: [line('people', 'check'), line('check', 'else')],
})

describe('If person state, Get our chat with them and Split people (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
      fresh = await account({
         connectionsReadAt: new Date(),
         messagesReadAt: new Date(),
      })
      stale = await account({
         connectionsReadAt: new Date(Date.now() - 72 * HOUR_MS),
         messagesReadAt: null,
      })
      await db.linkedInConnection.create({
         data: {
            userId,
            accountId: fresh,
            slug: 'conn',
            name: 'Connie',
            headline: 'Head of sales',
            connectedOn: new Date(Date.now() - 10 * 24 * HOUR_MS),
         },
      })
      await chat('talk', ['ME', 'THEM'])
      await chat('wrote', ['ME'])
      await chat('group', ['THEM'], 'GROUP')
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should pass on the people connected to an account, and tell each of the rest why', async () => {
      const runId = await run(
         checkGraph({
            check: 'connected',
            op: 'is',
            value: 'yes',
         })
      )

      expect(await slugsAt(runId, 'check')).toEqual(['conn'])

      const rest = await itemsAt(runId, 'else')

      expect(rest.map(({ slug }) => slug)).toEqual(['free', 'group', 'talk', 'wrote'])
      expect(rest.every(item => reasonOf(item) === 'Did not match: Connected to an account.')).toBe(true)
      expect(await messageOf(runId, 'check')).toBe('5 in, 1 on, 4 to Else.')
   })

   it('should find people we wrote to, people they wrote to, and people never written to', async () => {
      const wrote = await run(
         checkGraph({
            check: 'wroteTo',
            op: 'is',
            value: 'yes',
         })
      )
      const theyWrote = await run(
         checkGraph({
            check: 'theyWrote',
            op: 'is',
            value: 'yes',
         })
      )
      const never = await run(
         checkGraph({
            check: 'wroteTo',
            op: 'is',
            value: 'no',
         })
      )

      expect(await slugsAt(wrote, 'check')).toEqual(['talk', 'wrote'])
      // The group chat is not a chat with them.
      expect(await slugsAt(theyWrote, 'check')).toEqual(['talk'])
      expect(await slugsAt(never, 'check')).toEqual(['conn', 'free', 'group'])
   })

   it('should combine checks with all or any', async () => {
      const all = await run(
         checkGraph({
            check: 'chatStored',
            op: 'is',
            value: 'yes',
            check2: 'theyWrote',
            op2: 'is',
            value2: 'no',
         })
      )
      const any = await run(
         checkGraph({
            match: 'any',
            check: 'connected',
            op: 'is',
            value: 'yes',
            check2: 'theyWrote',
            op2: 'is',
            value2: 'yes',
         })
      )

      expect(await slugsAt(all, 'check')).toEqual(['wrote'])
      expect(await slugsAt(any, 'check')).toEqual(['conn', 'talk'])
   })

   it('should say not known, and name the read to make, when the account was read too long ago', async () => {
      const runId = await run(
         checkGraph({
            check: 'connected',
            op: 'is',
            value: 'yes',
            accountMode: 'one',
            account: stale,
         })
      )

      expect(await slugsAt(runId, 'check')).toEqual([])
      expect(
         (await itemsAt(runId, 'else')).every(
            item => reasonOf(item) === "Not known: read the account's connections first."
         )
      ).toBe(true)
      expect(await messageOf(runId, 'check')).toContain('5 people were not known')
   })

   it('should read the days a fact counts and the invite state of a person My network holds', async () => {
      await db.person.update({
         where: {
            userId_slug: {
               userId,
               slug: 'wrote',
            },
         },
         data: {
            inviteState: 'PENDING',
            invitedAt: new Date(Date.now() - 25 * 24 * HOUR_MS),
         },
      })

      const runId = await run(
         checkGraph({
            check: 'inviteState',
            op: 'is',
            value: 'pending',
            check2: 'invitePendingDays',
            op2: 'atLeast',
            value2: '21',
         })
      )

      expect(await slugsAt(runId, 'check')).toEqual(['wrote'])
   })

   it('should find the stored chat of each person with pointers and counts, and keep no words in the run', async () => {
      const graph: Graph = {
         nodes: [node('people', 'input.profiles', { links: PEOPLE.map(profile) }), node('chat', 'collect.chat')],
         edges: [line('people', 'chat')],
      }
      const runId = await run(graph)
      const items = await itemsAt(runId, 'chat')
      const chatOf = (slug: string) =>
         (items.find(item => item.slug === slug)?.data as { chat?: Record<string, unknown> }).chat

      expect(chatOf('talk')).toMatchObject({
         stored: true,
         complete: true,
         messages: 2,
         weWrote: true,
         theyWrote: true,
         lastFrom: 'THEM',
      })
      expect(chatOf('wrote')).toMatchObject({
         stored: true,
         weWrote: true,
         theyWrote: false,
      })
      // A group chat and a person with no chat both read as none stored.
      expect(chatOf('group')).toMatchObject({ stored: false })
      expect(chatOf('free')).toMatchObject({
         stored: false,
         conversationIds: [],
      })
      expect(JSON.stringify(items.map(({ data }) => data))).not.toContain('private word')
      expect(await messageOf(runId, 'chat')).toContain('5 people: 2 have a stored chat, 3 none stored, 0 not read')
   })

   it('should say a chat is not read when no account in scope ever read messages', async () => {
      const graph: Graph = {
         nodes: [
            node('people', 'input.profiles', { links: ['talk'].map(profile) }),
            node('chat', 'collect.chat', {
               accountMode: 'one',
               account: stale,
            }),
         ],
         edges: [line('people', 'chat')],
      }
      const runId = await run(graph)
      const [item] = await itemsAt(runId, 'chat')

      expect((item?.data as { chat?: { stored: boolean | null } }).chat?.stored).toBeNull()
      expect(await messageOf(runId, 'chat')).toContain('1 not read')
   })

   it('should read the newest messages of a chat for the owner only, with contact details removed, and say when each account was read', async () => {
      const lines = await PersonStateService.digest(userId, 'talk', {
         accountIds: [fresh],
         latest: 1,
         redact: true,
      })

      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatchObject({ from: 'THEM' })
      expect(lines[0]?.text).toBe('a private word from talk [email removed]')

      const stranger = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id

      expect(
         await PersonStateService.digest(stranger, 'talk', {
            accountIds: [fresh],
            latest: 5,
            redact: true,
         })
      ).toEqual([])
      expect(await PersonStateService.reads(stranger)).toEqual([])
      expect((await PersonStateService.reads(userId)).map(({ messagesReadAt }) => messagesReadAt === null)).toEqual([
         false,
         true,
      ])

      await db.user.delete({ where: { id: stranger } })
   })

   it('should split the same way on every run, and send the rest to Else', async () => {
      const slugs = Array.from({ length: 40 }, (_, index) => `s${index}`)
      const graph: Graph = {
         nodes: [
            node('people', 'input.profiles', { links: slugs.map(profile) }),
            node('split', 'logic.split', { percent: 50 }),
            node('else', 'logic.else'),
         ],
         edges: [line('people', 'split'), line('split', 'else')],
      }
      const first = await run(graph)
      const on = await slugsAt(first, 'split')
      const rest = await slugsAt(first, 'else')

      expect(on.length + rest.length).toBe(40)
      expect(on.length).toBeGreaterThan(8)
      expect(on.length).toBeLessThan(32)
      expect(new Set([...on, ...rest]).size).toBe(40)
   })
})
