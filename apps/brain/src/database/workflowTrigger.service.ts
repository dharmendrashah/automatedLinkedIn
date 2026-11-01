import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

import { type Prisma } from 'generated/prisma/client'

import { ConflictError } from './conflict'
import { PrismaService } from './prisma.service'
import { MAX_CHAIN_DEPTH, WorkflowService } from './workflow.service'

// Starts that come from outside the app (an API call) or from another workflow finishing.

export const API_LIMITS = {
   items: 200,
   callsPerHour: 60,
   keyHours: 24,
} as const

const HOUR_MS = 60 * 60 * 1000

const digest = (token: string) => createHash('sha256').update(token).digest()

// What a call carries, by the field names the blocks describe (`apiFields` in the contracts package).
export type ApiInput = Record<string, string | string[] | undefined>

export class WorkflowTriggerService {
   // A new token, shown once; the old one stops working. null when the workflow is not the owner's.
   public static async rotateToken(userId: string, id: string) {
      const token = randomBytes(32).toString('base64url')
      const { count } = await PrismaService.client.workflow.updateMany({
         where: {
            id,
            userId,
         },
         data: { apiTokenHash: digest(token).toString('hex') },
      })

      return count === 1 ? token : null
   }

   // Whether the owner's workflow has a token and how many calls it got this hour. null when it is not the owner's.
   public static async apiStatus(userId: string, id: string) {
      const workflow = await PrismaService.client.workflow.findFirst({
         where: {
            id,
            userId,
         },
         select: { apiTokenHash: true },
      })

      return workflow
         ? {
              hasToken: workflow.apiTokenHash !== null,
              callsLastHour: await WorkflowTriggerService.callsLastHour(id),
              limits: API_LIMITS,
           }
         : null
   }

   // The workflow this token opens, or null. Compared in constant time.
   public static async authorize(id: string, token: string) {
      const workflow = await PrismaService.client.workflow.findUnique({
         where: { id },
         select: {
            id: true,
            userId: true,
            enabled: true,
            graph: true,
            apiTokenHash: true,
         },
      })
      const expected = workflow?.apiTokenHash ? Buffer.from(workflow.apiTokenHash, 'hex') : null
      const given = digest(token)

      return workflow && expected && expected.length === given.length && timingSafeEqual(expected, given)
         ? workflow
         : null
   }

   public static callsLastHour(workflowId: string) {
      return PrismaService.client.workflowRun.count({
         where: {
            workflowId,
            trigger: 'API',
            startedAt: { gte: new Date(Date.now() - HOUR_MS) },
         },
      })
   }

   // A repeated call with the same key within 24 hours answers with the run it started instead of a new one.
   public static async startFromApi(workflow: { id: string; userId: string }, input: ApiInput, key: string | null) {
      const base = `${workflow.id}:api:${key ?? randomUUID()}`
      const earlier = key
         ? await PrismaService.client.workflowRun.findUnique({
              where: { runKey: base },
              select: {
                 id: true,
                 status: true,
                 startedAt: true,
              },
           })
         : null

      if (earlier && earlier.startedAt.getTime() > Date.now() - API_LIMITS.keyHours * HOUR_MS) {
         return earlier
      }

      const runKey = earlier ? `${base}:${Date.now()}` : base

      return WorkflowService.startRun(workflow.userId, workflow.id, 'API', runKey, { input })
   }

   // Starts the workflows that listen to a finished run, passing on the people it kept. Refused starts are skipped.
   public static async startAfter(
      run: { id: string; userId: string; workflowId: string; depth: number },
      people: Prisma.InputJsonValue[]
   ) {
      if (run.depth + 1 > MAX_CHAIN_DEPTH || people.length === 0) {
         return 0
      }

      let started = 0

      for (const id of await WorkflowService.listeners(run.userId, run.workflowId)) {
         try {
            await WorkflowService.startRun(run.userId, id, 'WORKFLOW', `${id}:after:${run.id}`, {
               input: { people },
               depth: run.depth + 1,
            })
            started += 1
         } catch (error) {
            if (!(error instanceof ConflictError)) {
               throw error
            }
         }
      }

      return started
   }
}
