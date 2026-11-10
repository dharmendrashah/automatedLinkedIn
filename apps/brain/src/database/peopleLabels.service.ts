import { LABEL_MAX } from '@automatedLinkedIn/contracts'

import { PeopleIndexService } from './peopleIndex.service'
import { PrismaService } from './prisma.service'

export type LabelledPerson = { slug: string; tags: string[] }

// The new tags that fit under the cap, in first-seen order; the rest are returned as overflow.
const fit = (existing: string[], tags: string[]) => {
   const room = Math.max(0, LABEL_MAX - existing.length)
   const fresh = [...new Set(tags)].filter(tag => !existing.includes(tag))
   const added = fresh.slice(0, room)

   return {
      added,
      overflow: fresh.length - added.length,
   }
}

// Adds a run's tags to each person's labels. Existing labels stay (a person may hold more than the cap); only the new tags are capped.
export class PeopleLabelService {
   public static async label(userId: string, people: LabelledPerson[], { build }: { build: boolean }) {
      if (build) {
         await PeopleIndexService.refresh(
            userId,
            people.map(({ slug }) => slug)
         )
      }

      let dropped = 0
      let withoutRow = 0

      for (const { slug, tags } of people) {
         // The row lock makes a second writer of the same person wait and then see the first one's labels.
         const overflow = await PrismaService.client.$transaction(async tx => {
            const [row] = await tx.$queryRaw<Array<{ labels: string[] | null }>>`
               SELECT "labels" FROM "Person" WHERE "userId" = ${userId} AND "slug" = ${slug} FOR UPDATE`

            if (!row) {
               return null
            }

            const existing = row.labels ?? []
            const { added, overflow: rest } = fit(existing, tags)

            if (added.length > 0) {
               await tx.person.update({
                  where: {
                     userId_slug: {
                        userId,
                        slug,
                     },
                  },
                  data: { labels: [...existing, ...added] },
               })
            }

            return rest
         })

         if (overflow === null) {
            withoutRow += 1
         } else {
            dropped += overflow
         }
      }

      return {
         dropped,
         withoutRow,
      }
   }
}
