import { type Graph, type InputPick, type InputType, addedSince, inputPickOf } from '@automatedLinkedIn/contracts'

import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInPostService } from './linkedInPost.service'
import { LinkedInProfileService } from './linkedInProfile.service'
import { type InputFilter } from './linkedInRecord'
import { PrismaService } from './prisma.service'

export { type InputType } from '@automatedLinkedIn/contracts'

const isInput = (type: string): type is InputType =>
   type === 'input.posts' || type === 'input.profiles' || type === 'input.companies'

type Statuses = 'NEW' | 'CONTACTED' | 'REPLIED'

const filterOf = (pick: InputPick, since: Date | null): InputFilter<Statuses> => ({
   since,
   labels: pick.labels,
   labelMatch: pick.labelMatch,
   withoutLabels: pick.withoutLabels,
   statuses: pick.statuses,
   order: pick.order,
})

export class InputPickService {
   // When this workflow's last successful run started. Failed, stopped and preview runs do not count, so nothing they
   // missed is skipped.
   public static async lastRunAt(userId: string, workflowId: string) {
      const run = await PrismaService.client.workflowRun.findFirst({
         where: {
            userId,
            workflowId,
            status: { in: ['SUCCEEDED', 'PARTIAL'] },
            trigger: { not: 'PREVIEW' },
         },
         orderBy: { startedAt: 'desc' },
         select: { startedAt: true },
      })

      return run?.startedAt ?? null
   }

   public static async filter(userId: string, pick: InputPick, workflowId: string | null, now = new Date()) {
      const lastRunAt =
         pick.added === 'lastRun' && workflowId ? await InputPickService.lastRunAt(userId, workflowId) : null

      return filterOf(pick, addedSince(pick, now, lastRunAt))
   }

   // How many items each input block of a graph would take now, after its filters, for the estimate.
   public static async counts(userId: string, graph: Graph, workflowId: string | null) {
      const inputs = graph.nodes.flatMap(node =>
         isInput(node.type)
            ? [
                 {
                    ...node,
                    type: node.type,
                 },
              ]
            : []
      )
      const counted = await Promise.all(
         inputs.map(async ({ id, type, config }) => {
            const filter = await InputPickService.filter(userId, inputPickOf(type, config), workflowId)

            return [id, await InputPickService.count(userId, type, filter)] as const
         })
      )

      return Object.fromEntries(counted)
   }

   // How many items the block would take right now, before its How many cap.
   public static count(userId: string, type: InputType, filter: InputFilter<Statuses>) {
      switch (type) {
         case 'input.posts':
            return LinkedInPostService.countWaiting(userId, {
               ...filter,
               statuses: [],
            })
         case 'input.profiles':
            return LinkedInProfileService.countPicked(userId, filter)
         case 'input.companies':
            return LinkedInCompanyService.countPicked(userId, filter)
      }
   }
}
