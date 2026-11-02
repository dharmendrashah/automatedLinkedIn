import { z } from 'zod'

import { PrismaService } from './prisma.service'

// The requests an Account Actions block made in a run (.plan/account-action-blocks.md), so a repeated tick finds what was asked and
// never asks again.

export type CallState = 'ASKED' | 'DONE' | 'FAILED'

// What a call keeps: the id the domain service knows the request by, and how it ended, as fixed words and one fixed sentence.
export type CallResult = { ref?: string; status?: string; reason?: string | null; at?: string | null }

const resultSchema = z.object({
   ref: z.string().optional(),
   status: z.string().optional(),
   reason: z.string().nullable().optional(),
   at: z.string().nullable().optional(),
})

export class AccountActionService {
   public static async ofStep(runId: string, nodeId: string) {
      const rows = await PrismaService.client.accountActionCall.findMany({
         where: {
            runId,
            nodeId,
         },
         select: {
            id: true,
            slug: true,
            accountId: true,
            state: true,
            result: true,
            createdAt: true,
         },
      })

      return rows.map(({ result, ...row }) => ({
         ...row,
         result: resultSchema.safeParse(result).data ?? {},
      }))
   }

   // Writes down that a request was made (or, with FAILED, that it was refused for good); asking twice for the same run, block,
   // person and account keeps the first.
   public static async ask(
      runId: string,
      nodeId: string,
      slug: string,
      accountId: string,
      state: CallState = 'ASKED',
      result: CallResult = {}
   ) {
      await PrismaService.client.accountActionCall.createMany({
         data: [
            {
               runId,
               nodeId,
               slug,
               accountId,
               state,
               result,
            },
         ],
         skipDuplicates: true,
      })
   }

   public static async settle(id: string, state: CallState, result?: CallResult) {
      await PrismaService.client.accountActionCall.update({
         where: { id },
         data: {
            state,
            ...(result && { result }),
         },
      })
   }
}
