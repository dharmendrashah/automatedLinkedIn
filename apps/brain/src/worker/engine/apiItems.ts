import { parseLinkedInUrl } from 'core/linkedInUrl'
import { type CompanyItem, type WorkflowItemData, person } from 'core/workflowItem'

import { type BlockType, blockOf } from '@automatedLinkedIn/contracts'

// The people or companies a call names for an Account Actions block that comes straight after "When called by API"
// (.plan/account-action-blocks.md). The block acts on exactly those links; a call that names none gives it nobody. A link that is not
// one of that kind is dropped, and each one counts once.
export const apiItemsOf = (type: BlockType, input: unknown): WorkflowItemData[] => {
   const sent = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
   const items = new Map<string, WorkflowItemData>()

   for (const { field, items: kind } of blockOf(type).api ?? []) {
      const values = sent[field]

      if (!kind || !Array.isArray(values)) {
         continue
      }

      for (const value of values) {
         const link = typeof value === 'string' ? parseLinkedInUrl(value, kind) : null

         if (link && !items.has(`${kind}:${link.slug}`)) {
            items.set(
               `${kind}:${link.slug}`,
               kind === 'profile'
                  ? person({
                       slug: link.slug,
                       url: link.url,
                       known: true,
                    })
                  : ({
                       kind: 'company',
                       slug: link.slug,
                       url: link.url,
                       name: null,
                       hiring: [],
                    } satisfies CompanyItem)
            )
         }
      }
   }

   return [...items.values()]
}
