import {
   type Graph,
   type InputPick,
   type InputType,
   inputPickOf,
   readCompanyFilters,
   timeFrameOf,
} from '@automatedLinkedIn/contracts'

import { IcpService } from './icp.service'
import { InputPeopleService, type NetworkPick } from './inputPeople.service'
import { slugsInWindow } from './inputWindow'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInPostService } from './linkedInPost.service'
import { LinkedInProfileService } from './linkedInProfile.service'
import { type InputFilter } from './linkedInRecord'
import { PrismaService } from './prisma.service'

export { type InputType } from '@automatedLinkedIn/contracts'

const isInput = (type: string): type is InputType =>
   type === 'input.posts' || type === 'input.profiles' || type === 'input.companies'

type Statuses = 'NEW' | 'CONTACTED' | 'REPLIED'

const filterOf = (
   pick: InputPick,
   frame: { from: Date | null; until: Date | null },
   slugs: string[] | null,
   ids: string[] | null,
   network: NetworkPick | null
): InputFilter<Statuses> => ({
   since: frame.from,
   until: frame.until,
   field: pick.dateField,
   slugs,
   ids,
   network,
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

   // `type` lets a time frame look at a date of the item itself (a post's posted date, a company's last read).
   public static async filter(
      userId: string,
      pick: InputPick,
      workflowId: string | null,
      type?: InputType,
      now = new Date()
   ) {
      const lastRunAt =
         pick.added === 'lastRun' && workflowId ? await InputPickService.lastRunAt(userId, workflowId) : null
      const frame = timeFrameOf(pick, now, lastRunAt)
      const slugs =
         type && pick.dateField !== 'added' && (frame.from || frame.until)
            ? await slugsInWindow(userId, type, pick.dateField, frame)
            : null

      return filterOf(
         pick,
         frame,
         slugs,
         type ? await InputPickService.idsOf(userId, pick, type) : null,
         type === 'input.profiles' && pick.source === 'network'
            ? await InputPeopleService.scope(userId, pick.client, pick.filters)
            : null
      )
   }

   // The items the page's own filters find for this block, or null when the block has none of them on.
   private static async idsOf(userId: string, pick: InputPick, type: InputType) {
      if (type !== 'input.companies') {
         return null
      }

      const { icpId, icpIncludeUnread, ...filters } = readCompanyFilters(pick.filters).filters ?? {}

      if (!icpId && Object.keys(filters).length === 0 && pick.search === '') {
         return null
      }

      const icp = icpId ? await IcpService.getForUser(userId, icpId) : null

      // An ideal customer that is gone matches nothing, rather than everything.
      if (icpId && !icp) {
         return []
      }

      return LinkedInCompanyService.matchingIds(userId, {
         ...filters,
         ...(pick.search === '' ? {} : { search: pick.search }),
         ...(icp
            ? {
                 icp: {
                    rules: icp,
                    includeUnread: icpIncludeUnread ?? false,
                 },
              }
            : {}),
      })
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
            const filter = await InputPickService.filter(userId, inputPickOf(type, config), workflowId, type)

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
