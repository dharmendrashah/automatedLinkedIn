import { PrismaService } from './prisma.service'

// The requests an Account Actions block made in a run (.plan/account-action-blocks.md), so a repeated tick finds what was asked and
// never asks again.

export type CallState = 'ASKED' | 'DONE' | 'FAILED'

export class AccountActionService {
   public static ofStep(runId: string, nodeId: string) {
      return PrismaService.client.accountActionCall.findMany({
         where: {
            runId,
            nodeId,
         },
         select: {
            id: true,
            slug: true,
            accountId: true,
            state: true,
            createdAt: true,
         },
      })
   }

   // Writes down that a request was made (or, with FAILED, that it was refused for good); asking twice for the same run, block,
   // person and account keeps the first.
   public static async ask(runId: string, nodeId: string, slug: string, accountId: string, state: CallState = 'ASKED') {
      await PrismaService.client.accountActionCall.createMany({
         data: [
            {
               runId,
               nodeId,
               slug,
               accountId,
               state,
            },
         ],
         skipDuplicates: true,
      })
   }

   public static async settle(id: string, state: CallState) {
      await PrismaService.client.accountActionCall.update({
         where: { id },
         data: { state },
      })
   }
}
