import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Graph } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WorkflowService } from './workflow.service'
import { MAX_VERSIONS } from './workflowVersion'

// Needs PostgreSQL. Every save that changes the graph keeps a version, and one can be restored
// (.plan/workflow-engine-p5-editor.md).

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

const graphOf = (fileName: string): Graph => ({
   nodes: [
      {
         id: 'start',
         type: 'trigger.manual',
         config: {},
         position: {
            x: 0,
            y: 0,
         },
      },
      {
         id: 'file',
         type: 'output.csv',
         config: { fileName },
         position: {
            x: 0,
            y: 100,
         },
      },
   ],
   edges: [
      {
         from: 'start',
         to: 'file',
      },
   ],
})

let userId: string
let otherId: string

const created = () =>
   WorkflowService.create(userId, {
      name: `History ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph: graphOf('first'),
   })

const countOf = (workflowId: string) => PrismaService.client.workflowVersion.count({ where: { workflowId } })

const fileNameOf = async (workflowId: string) =>
   (await WorkflowService.get(userId, workflowId))?.graph as unknown as Graph | undefined

describe('workflow history (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherId = (await UserService.create({ email: otherEmail })).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should keep a version on create and on a change of the graph, and none for a rename or the same graph', async () => {
      const { id } = await created()

      expect(await countOf(id)).toBe(1)

      await WorkflowService.update(userId, id, { graph: graphOf('second') })
      expect(await countOf(id)).toBe(2)

      await WorkflowService.update(userId, id, { graph: graphOf('second') })
      await WorkflowService.update(userId, id, { name: `Renamed ${randomUUID().slice(0, 8)}` })
      expect(await countOf(id)).toBe(2)
   })

   it('should list the versions newest first with their size, only to the owner', async () => {
      const { id } = await created()

      await WorkflowService.update(userId, id, { graph: graphOf('second') })

      const history = await WorkflowService.history(userId, id)

      expect(history?.map(({ blocks }) => blocks)).toEqual([2, 2])
      expect(history?.[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(history?.[1]?.createdAt.getTime() ?? 0)
      await expect(WorkflowService.history(otherId, id)).resolves.toBeNull()
   })

   it('should restore a version as a normal save, which is itself a version', async () => {
      const { id } = await created()

      await WorkflowService.update(userId, id, { graph: graphOf('second') })

      const oldest = (await WorkflowService.history(userId, id))?.at(-1)
      const restored = await WorkflowService.restore(userId, id, oldest?.id ?? '')

      expect(restored).not.toBeNull()
      expect(JSON.stringify((await fileNameOf(id))?.nodes[1]?.config)).toBe('{"fileName":"first"}')
      expect(await countOf(id)).toBe(3)
      await expect(WorkflowService.restore(userId, id, randomUUID())).resolves.toBeNull()
      await expect(WorkflowService.restore(otherId, id, oldest?.id ?? '')).resolves.toBeNull()
   })

   it('should keep only the newest versions', async () => {
      const { id } = await created()

      for (let change = 0; change < MAX_VERSIONS + 2; change += 1) {
         await WorkflowService.update(userId, id, { graph: graphOf(`change-${change}`) })
      }

      expect(await countOf(id)).toBe(MAX_VERSIONS)
   })
})
